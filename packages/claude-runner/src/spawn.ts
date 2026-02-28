import { spawn } from "node:child_process";
import type { ClaudeProcess, ClaudeStreamEvent, SpawnClaudeOptions } from "./types";

/**
 * Build the CLI argument array from options.
 * Flag ordering matters for the Claude CLI: resume/session flags come first,
 * then output flags, then tool filtering, then the prompt.
 */
export function buildArgs(options: SpawnClaudeOptions): string[] {
  const args: string[] = [];

  // Session / resume flags (must precede -p)
  if (options.resume) {
    args.push("--resume", options.resume);
  } else if (options.sessionId) {
    args.push("--session-id", options.sessionId);
  }

  // Output format
  args.push("--output-format", "stream-json");

  // Verbose (defaults to true)
  if (options.verbose !== false) {
    args.push("--verbose");
  }

  // Permission bypass
  if (options.dangerouslySkipPermissions) {
    args.push("--dangerously-skip-permissions");
  }

  // Turn limit
  if (options.maxTurns !== undefined) {
    args.push("--max-turns", String(options.maxTurns));
  }

  // Tool filtering
  if (options.allowedTools) {
    args.push("--allowedTools", options.allowedTools);
  }
  if (options.disallowedTools) {
    args.push("--disallowedTools", options.disallowedTools);
  }

  // Extra args (e.g. --model, --append-system-prompt)
  if (options.extraArgs) {
    args.push(...options.extraArgs);
  }

  // Prompt (always last)
  args.push("-p", options.prompt);

  return args;
}

/**
 * Low-level Claude CLI spawner.
 *
 * Spawns `claude` with the given options, handles line-buffered stdout parsing,
 * and returns a `ClaudeProcess` handle for event-driven consumption.
 *
 * Does **not** accumulate content, manage timeouts, or interpret events —
 * that's the job of higher-level wrappers like `runClaude()`.
 */
export function spawnClaude(options: SpawnClaudeOptions): ClaudeProcess {
  const args = buildArgs(options);

  // Check if already aborted before spawning
  if (options.signal?.aborted) {
    // Return a process handle that immediately errors
    const noop = () => {};
    const errProc: ClaudeProcess = {
      child: null,
      pid: undefined,
      onEvent: noop,
      onRawLine: noop,
      onStderr: noop,
      onExit: noop,
      onError: (handler) => handler(new DOMException("Aborted", "AbortError")),
      kill: () => false,
      exited: Promise.resolve(null),
    };
    // Defer the error callback to the microtask queue so callers can attach handlers
    Promise.resolve().then(() => {
      (errProc as { _abortError?: true })._abortError = true;
    });
    return errProc;
  }

  const child = spawn("claude", args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    stdio: ["pipe", "pipe", "pipe"],
  });

  // Close stdin — the prompt is passed via -p flag
  child.stdin?.end();

  // Handler registries
  const eventHandlers: Array<(event: ClaudeStreamEvent) => void> = [];
  const rawLineHandlers: Array<(line: string) => void> = [];
  const stderrHandlers: Array<(data: string) => void> = [];
  const exitHandlers: Array<(code: number | null, signal: NodeJS.Signals | null) => void> = [];
  const errorHandlers: Array<(error: Error) => void> = [];

  // Line-buffered stdout parsing
  let lineBuffer = "";
  child.stdout?.on("data", (data: Buffer) => {
    lineBuffer += data.toString();
    const lines = lineBuffer.split("\n");
    lineBuffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;

      // Deliver raw line first
      for (const handler of rawLineHandlers) handler(line);

      // Try to parse as JSON and deliver as event
      try {
        const evt = JSON.parse(line) as ClaudeStreamEvent;
        for (const handler of eventHandlers) handler(evt);
      } catch {
        // Not valid JSON — raw line handlers already got it
      }
    }
  });

  // Stderr forwarding
  child.stderr?.on("data", (data: Buffer) => {
    const text = data.toString();
    for (const handler of stderrHandlers) handler(text);
  });

  // Exit promise
  const exited = new Promise<number | null>((resolve) => {
    child.on("close", (code, signal) => {
      // Flush remaining buffer
      if (lineBuffer.trim()) {
        const line = lineBuffer;
        lineBuffer = "";
        for (const handler of rawLineHandlers) handler(line);
        try {
          const evt = JSON.parse(line) as ClaudeStreamEvent;
          for (const handler of eventHandlers) handler(evt);
        } catch {
          // Not valid JSON
        }
      }

      for (const handler of exitHandlers) handler(code, signal as NodeJS.Signals | null);
      resolve(code);
    });
  });

  // Error forwarding
  child.on("error", (err) => {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      const wrapped = new Error("Claude Code CLI not found. Install it with: npm install -g @anthropic-ai/claude-code");
      for (const handler of errorHandlers) handler(wrapped);
    } else {
      for (const handler of errorHandlers) handler(err);
    }
  });

  // Abort signal handling
  if (options.signal) {
    const onAbort = () => {
      child.kill("SIGTERM");
    };
    options.signal.addEventListener("abort", onAbort, { once: true });
    child.on("close", () => options.signal?.removeEventListener("abort", onAbort));
  }

  return {
    child,
    pid: child.pid,
    onEvent: (handler) => eventHandlers.push(handler),
    onRawLine: (handler) => rawLineHandlers.push(handler),
    onStderr: (handler) => stderrHandlers.push(handler),
    onExit: (handler) => exitHandlers.push(handler),
    onError: (handler) => errorHandlers.push(handler),
    kill: (signal) => child.kill(signal ?? "SIGTERM"),
    exited,
  };
}
