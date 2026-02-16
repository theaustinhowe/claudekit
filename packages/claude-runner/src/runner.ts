import { execSync, spawn } from "node:child_process";
import { parseStreamJsonEvent } from "./parser";
import type { ClaudeResult, ClaudeStreamEvent, RunClaudeOptions } from "./types";

/**
 * Check if the Claude CLI binary is available in PATH.
 */
export function isClaudeCliAvailable(): boolean {
  try {
    execSync("which claude", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Spawn the Claude CLI with stream-json output and real-time progress updates.
 *
 * Merges Gadget's runner with B4U's spawn health timer for better diagnostics.
 */
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
    spawnHealthTimeoutMs = 30_000,
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

    // Spawn health check — warn if no output after configured timeout
    const spawnHealthTimer = setTimeout(() => {
      if (bytesReceived === 0 && !settled) {
        onProgress({
          message: `Claude CLI has not responded after ${Math.round(spawnHealthTimeoutMs / 1000)}s — verify it's installed and in PATH`,
          bytesReceived: 0,
          log: `[warn] No output from Claude CLI after ${Math.round(spawnHealthTimeoutMs / 1000)}s`,
          logType: "status",
        });
      }
    }, spawnHealthTimeoutMs);

    child.stdin.write(prompt);
    child.stdin.end();

    const elapsed = () => {
      const s = Math.floor((Date.now() - startTime) / 1000);
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    };

    const keepAlive = setInterval(() => {
      const msg = bytesReceived > 0 ? `Generating... (${elapsed()})` : `Waiting for Claude CLI... (${elapsed()})`;
      onProgress({ message: msg, bytesReceived });
    }, 3_000);

    // Handle abort signal
    if (signal) {
      const onAbort = () => {
        clearInterval(keepAlive);
        clearTimeout(spawnHealthTimer);
        if (settled) return;
        settled = true;
        child.kill("SIGTERM");
        reject(new DOMException("Aborted", "AbortError"));
      };
      signal.addEventListener("abort", onAbort, { once: true });
      child.on("close", () => signal.removeEventListener("abort", onAbort));
    }

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
          const evt = JSON.parse(line) as ClaudeStreamEvent;

          if (evt.type === "result") {
            flushPendingAsContent();
            if (typeof evt.result === "string" && evt.result.trim().length > content.length) {
              content = evt.result.trim();
              bytesReceived = Buffer.byteLength(content);
            }
          }

          const { log, logType, chunk } = parseStreamJsonEvent(evt, cwd);

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
      clearTimeout(spawnHealthTimer);
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
      clearTimeout(spawnHealthTimer);
      if (settled) return;
      settled = true;
      if (lineBuffer.trim()) {
        try {
          const evt = JSON.parse(lineBuffer) as ClaudeStreamEvent;
          if (evt.type === "result") {
            flushPendingAsContent();
            if (typeof evt.result === "string" && evt.result.trim().length > content.length) {
              content = evt.result.trim();
              bytesReceived = Buffer.byteLength(content);
            }
          }
          const { chunk } = parseStreamJsonEvent(evt, cwd);
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
      clearTimeout(spawnHealthTimer);
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      reject(new Error(`Claude timed out after ${Math.round(timeoutMs / 60_000)} minutes`));
    }, timeoutMs);
  });
}
