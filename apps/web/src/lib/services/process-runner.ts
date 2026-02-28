import { spawn } from "node:child_process";

/**
 * Spawn a bash process and return a ReadableStream of stdout/stderr chunks.
 * The stream emits SSE-formatted events: { type: "output", data } and { type: "done", exitCode }.
 */
export function runCommand(command: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  let childProcess: ReturnType<typeof spawn> | undefined;

  return new ReadableStream({
    start(controller) {
      childProcess = spawn("bash", ["-l", "-c", command], {
        env: { ...process.env, FORCE_COLOR: "0" },
        stdio: ["ignore", "pipe", "pipe"],
      });

      function send(event: { type: string; data?: string; exitCode?: number }) {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // controller may be closed
        }
      }

      childProcess.stdout?.on("data", (chunk: Buffer) => {
        send({ type: "output", data: chunk.toString() });
      });

      childProcess.stderr?.on("data", (chunk: Buffer) => {
        send({ type: "output", data: chunk.toString() });
      });

      childProcess.on("close", (code) => {
        send({ type: "done", exitCode: code ?? 1 });
        try {
          controller.close();
        } catch {
          // already closed
        }
      });

      childProcess.on("error", (err) => {
        send({ type: "error", data: err.message });
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
    cancel() {
      // Kill child process on client disconnect
      childProcess?.kill("SIGTERM");
    },
  });
}
