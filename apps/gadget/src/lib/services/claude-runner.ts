import { spawn } from "node:child_process";

type LogType = "tool" | "thinking" | "status";

interface ClaudeResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

interface ProgressInfo {
  message: string;
  bytesReceived: number;
  chunk?: string;
  log?: string;
  logType?: LogType;
}

interface RunClaudeOptions {
  cwd: string;
  prompt: string;
  allowedTools?: string;
  disallowedTools?: string;
  onProgress: (info: ProgressInfo) => void;
  timeoutMs?: number;
  signal?: AbortSignal;
  onPid?: (pid: number) => void;
}

export function runClaude(options: RunClaudeOptions): Promise<ClaudeResult> {
  const {
    cwd,
    prompt,
    allowedTools = "Write",
    disallowedTools = "Edit,Bash",
    onProgress,
    timeoutMs = 10 * 60_000,
    signal,
    onPid,
  } = options;

  return new Promise((resolve, reject) => {
    let settled = false;

    const args = ["-p", "--verbose", "--output-format", "stream-json"];
    if (allowedTools) {
      args.push("--allowedTools", allowedTools);
    }
    if (disallowedTools) {
      args.push("--disallowedTools", disallowedTools);
    }

    // Check if already aborted before spawning
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }

    const child = spawn("claude", args, {
      cwd,
      env: { ...process.env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Expose child PID
    if (onPid && child.pid) {
      onPid(child.pid);
    }

    let content = "";
    let stderr = "";
    let bytesReceived = 0;
    const startTime = Date.now();

    child.stdin.write(prompt);
    child.stdin.end();

    const elapsed = () => {
      const s = Math.floor((Date.now() - startTime) / 1000);
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    };

    const keepAlive = setInterval(() => {
      const msg = bytesReceived > 0 ? `Generating... (${elapsed()})` : `Waiting... (${elapsed()})`;
      onProgress({ message: msg, bytesReceived });
    }, 3_000);

    // Handle abort signal (after keepAlive is declared)
    if (signal) {
      const onAbort = () => {
        clearInterval(keepAlive);
        if (settled) return;
        settled = true;
        child.kill("SIGTERM");
        reject(new DOMException("Aborted", "AbortError"));
      };
      signal.addEventListener("abort", onAbort, { once: true });
      child.on("close", () => signal.removeEventListener("abort", onAbort));
    }

    // biome-ignore lint/suspicious/noExplicitAny: stream-json events have dynamic shapes
    type Evt = Record<string, any>;

    const shortPath = (p: string) => {
      if (typeof p !== "string") return String(p);
      return p.startsWith(cwd) ? p.slice(cwd.length + 1) : p;
    };

    /** Process one stream-json event. Returns { log?, logType?, chunk? } */
    const processEvent = (evt: Evt): { log?: string; logType?: LogType; chunk?: string } => {
      const t = evt.type as string;

      if (t === "system") return { log: "Connected", logType: "status" };

      if (t === "result") {
        const dur = evt.duration_ms ?? evt.duration_api_ms;
        return {
          log: `Done${dur ? ` in ${(Number(dur) / 1000).toFixed(1)}s` : ""}`,
          logType: "status",
        };
      }

      const blocks = evt.message?.content as Evt[] | undefined;
      if (!blocks) return {};

      const hasToolUse = blocks.some((b) => b.type === "tool_use");

      if (hasToolUse) {
        const result: { log?: string; logType?: LogType; chunk?: string } = {};

        for (const block of blocks) {
          if (block.type === "tool_use" && block.name === "Write") {
            const input = block.input as Evt | undefined;
            if (input?.content && typeof input.content === "string") {
              result.chunk = input.content;
            }
          }
        }
        const toolLines: string[] = [];
        const thinkingLines: string[] = [];

        for (const block of blocks) {
          if (block.type === "text") {
            const text = (block.text as string).trim();
            if (text) {
              const firstLine = text.split("\n")[0].slice(0, 80);
              thinkingLines.push(firstLine + (text.length > 80 ? "..." : ""));
            }
          }
          if (block.type === "tool_use") {
            const name = block.name as string;
            if (!["Read", "Glob", "Grep", "LS", "Bash", "Write", "Edit"].includes(name)) continue;
            let input = block.input as Evt | undefined;
            if (typeof input === "string") {
              try {
                input = JSON.parse(input);
              } catch {
                /* ignore */
              }
            }
            let arg = input?.file_path ?? input?.pattern ?? input?.path ?? input?.command;
            if (input?.pattern && input?.path && (name === "Glob" || name === "Grep")) {
              arg = `${input.pattern}  ${shortPath(input.path)}`;
            }
            toolLines.push(arg ? `${name}  ${shortPath(arg)}` : name);
          }
        }

        const allLines = [...thinkingLines, ...toolLines];
        if (allLines.length > 0) {
          result.log = thinkingLines
            .map((l) => `\t${l}`)
            .concat(toolLines)
            .join("\n");
          result.logType = "tool";
        }
        return result;
      }

      if (t === "assistant") {
        const texts = blocks.filter((b) => b.type === "text").map((b) => b.text as string);
        if (texts.length > 0) return { chunk: texts.join("") };
      }

      return {};
    };

    let pendingText: string | null = null;

    const flushPendingAsLog = () => {
      if (!pendingText) return;
      const firstLine = pendingText.trim().split("\n")[0].slice(0, 100);
      if (firstLine) {
        onProgress({
          message: `Analyzing... (${elapsed()})`,
          bytesReceived,
          log: `\t${firstLine}`,
          logType: "thinking",
        });
      }
      pendingText = null;
    };

    const flushPendingAsContent = () => {
      if (!pendingText) return;
      content += pendingText;
      bytesReceived += Buffer.byteLength(pendingText);
      onProgress({
        message: `Generating... (${elapsed()})`,
        bytesReceived,
        chunk: pendingText,
      });
      pendingText = null;
    };

    let lineBuffer = "";
    child.stdout.on("data", (data: Buffer) => {
      lineBuffer += data.toString();
      const lines = lineBuffer.split("\n");
      lineBuffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const evt = JSON.parse(line) as Evt;

          if (evt.type === "result") {
            flushPendingAsContent();
            if (typeof evt.result === "string" && evt.result.trim().length > content.length) {
              content = evt.result.trim();
              bytesReceived = Buffer.byteLength(content);
            }
          }

          const { log, logType, chunk } = processEvent(evt);

          if (chunk) {
            flushPendingAsLog();
            pendingText = chunk;
          } else if (log) {
            flushPendingAsLog();
            onProgress({
              message: `Analyzing... (${elapsed()})`,
              bytesReceived,
              log,
              logType,
            });
          }
        } catch {
          flushPendingAsLog();
          onProgress({ message: line, bytesReceived, log: line });
        }
      }
    });

    child.stderr.on("data", (data: Buffer) => {
      const text = data.toString();
      stderr += text;
      for (const line of text.split("\n")) {
        if (line.trim()) {
          onProgress({ message: line, bytesReceived, log: `[stderr] ${line}` });
        }
      }
    });

    child.on("error", (err) => {
      clearInterval(keepAlive);
      if (settled) return;
      settled = true;
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        reject(new Error("Claude Code CLI not found. Install it with: npm install -g @anthropic-ai/claude-code"));
      } else {
        reject(err);
      }
    });

    child.on("close", (code) => {
      clearInterval(keepAlive);
      if (settled) return;
      settled = true;
      if (lineBuffer.trim()) {
        try {
          const evt = JSON.parse(lineBuffer) as Evt;
          if (evt.type === "result") {
            flushPendingAsContent();
            if (typeof evt.result === "string" && evt.result.trim().length > content.length) {
              content = evt.result.trim();
              bytesReceived = Buffer.byteLength(content);
            }
          }
          const { chunk } = processEvent(evt);
          if (chunk) pendingText = chunk;
        } catch {
          // ignore
        }
      }
      flushPendingAsContent();
      resolve({ stdout: content, stderr, exitCode: code });
    });

    setTimeout(() => {
      clearInterval(keepAlive);
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      reject(new Error(`Claude timed out after ${Math.round(timeoutMs / 60_000)} minutes`));
    }, timeoutMs);
  });
}
