import { existsSync, watch } from "node:fs";
import { open } from "node:fs/promises";
import { createInterface } from "node:readline";
import { getLogFilePath } from "@claudekit/logger";
import { NextResponse } from "next/server";

export async function GET(request: Request, { params }: { params: Promise<{ app: string }> }) {
  const { app } = await params;
  const url = new URL(request.url);
  const date = url.searchParams.get("date") || undefined;
  const logFile = getLogFilePath(app, undefined, date);

  if (!existsSync(logFile)) {
    return NextResponse.json({ error: "Log file not found" }, { status: 404 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // Read last 50 lines first
      const fh = await open(logFile, "r");
      const rl = createInterface({ input: fh.createReadStream({ encoding: "utf-8" }) });
      const recentLines: string[] = [];
      for await (const line of rl) {
        recentLines.push(line);
        if (recentLines.length > 50) recentLines.shift();
      }
      await fh.close();

      for (const line of recentLines) {
        if (line.trim()) {
          controller.enqueue(encoder.encode(`data: ${line}\n\n`));
        }
      }

      // Watch for new lines
      let lastSize = 0;
      try {
        const stat = await import("node:fs").then((fs) => fs.statSync(logFile));
        lastSize = stat.size;
      } catch {
        // ignore
      }

      const watcher = watch(logFile, async () => {
        try {
          const stat = await import("node:fs").then((fs) => fs.statSync(logFile));
          if (stat.size <= lastSize) return;

          const fh2 = await open(logFile, "r");
          const buf = Buffer.alloc(stat.size - lastSize);
          await fh2.read(buf, 0, buf.length, lastSize);
          await fh2.close();
          lastSize = stat.size;

          const newContent = buf.toString("utf-8");
          for (const line of newContent.split("\n")) {
            if (line.trim()) {
              controller.enqueue(encoder.encode(`data: ${line}\n\n`));
            }
          }
        } catch {
          // File might be rotating
        }
      });

      // Keep connection alive
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          clearInterval(heartbeat);
          watcher.close();
        }
      }, 15000);

      // Clean up on close
      const cleanup = () => {
        clearInterval(heartbeat);
        watcher.close();
      };

      // The controller will be closed when the client disconnects
      controller.enqueue(encoder.encode(": connected\n\n"));

      // Store cleanup for when stream is cancelled
      (stream as unknown as Record<string, unknown>).__cleanup = cleanup;
    },
    cancel() {
      const cleanup = (stream as unknown as Record<string, unknown>).__cleanup as (() => void) | undefined;
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
