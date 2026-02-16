import { type ChildProcess, spawn } from "node:child_process";

interface RunProcessOptions {
  command: string;
  cwd?: string;
  signal: AbortSignal;
  onStdout?: (data: string) => void;
  onStderr?: (data: string) => void;
}

/**
 * Spawn a bash process and stream output.
 * Supports AbortSignal for cancellation.
 */
export function runProcess(opts: RunProcessOptions): Promise<{ exitCode: number }> {
  return new Promise((resolve, reject) => {
    if (opts.signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }

    let child: ChildProcess;
    try {
      child = spawn("bash", ["-l", "-c", opts.command], {
        cwd: opts.cwd,
        env: { ...process.env, FORCE_COLOR: "0" },
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      reject(err);
      return;
    }

    const onAbort = () => {
      child.kill("SIGTERM");
    };
    opts.signal.addEventListener("abort", onAbort, { once: true });

    child.stdout?.on("data", (chunk: Buffer) => {
      opts.onStdout?.(chunk.toString());
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      opts.onStderr?.(chunk.toString());
    });

    child.on("close", (code) => {
      opts.signal.removeEventListener("abort", onAbort);
      if (opts.signal.aborted) {
        reject(new DOMException("Aborted", "AbortError"));
      } else {
        resolve({ exitCode: code ?? 1 });
      }
    });

    child.on("error", (err) => {
      opts.signal.removeEventListener("abort", onAbort);
      reject(err);
    });
  });
}
