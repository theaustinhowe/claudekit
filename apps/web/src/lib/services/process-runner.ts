import { spawn } from "node:child_process";

/**
 * Spawn a bash process and return a ReadableStream of stdout/stderr chunks.
 * The stream emits SSE-formatted events: { type: "output", data } and { type: "done", exitCode }.
 */
export function runCommand(command: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    start(controller) {
      const child = spawn("bash", ["-l", "-c", command], {
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

      child.stdout?.on("data", (chunk: Buffer) => {
        send({ type: "output", data: chunk.toString() });
      });

      child.stderr?.on("data", (chunk: Buffer) => {
        send({ type: "output", data: chunk.toString() });
      });

      child.on("close", (code) => {
        send({ type: "done", exitCode: code ?? 1 });
        try {
          controller.close();
        } catch {
          // already closed
        }
      });

      child.on("error", (err) => {
        send({ type: "error", data: err.message });
        try {
          controller.close();
        } catch {
          // already closed
        }
      });

      // Store child for cleanup
      (controller as unknown as Record<string, unknown>).__child = child;
    },
    cancel() {
      // Kill child process on client disconnect
      const child = (this as unknown as Record<string, unknown>).__child as { kill: (s: string) => void } | undefined;
      child?.kill("SIGTERM");
    },
  });
}
