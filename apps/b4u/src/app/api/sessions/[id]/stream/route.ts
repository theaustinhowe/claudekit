import { subscribe } from "@/lib/claude/session-manager";
import type { SessionEvent, SessionLogRow, SessionRow } from "@/lib/claude/types";
import { query } from "@/lib/db";
import { ensureDatabase } from "@/lib/db-init";

const HEARTBEAT_INTERVAL_MS = 15_000;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: sessionId } = await params;

  let unsubscribe: (() => void) | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let streamClosed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const encode = (event: SessionEvent | { type: string }) =>
        new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);

      // Try live subscription first
      const result = subscribe(sessionId, (event: SessionEvent) => {
        if (streamClosed) return;

        controller.enqueue(encode(event));

        if (event.type === "done" || event.type === "error" || event.type === "cancelled") {
          streamClosed = true;
          if (heartbeatTimer) clearInterval(heartbeatTimer);
          controller.close();
        }
      });

      if (result) {
        // Live session found — set up heartbeat
        unsubscribe = result;

        heartbeatTimer = setInterval(() => {
          if (streamClosed) return;
          try {
            controller.enqueue(encode({ type: "heartbeat" }));
          } catch {
            // Stream closed
          }
        }, HEARTBEAT_INTERVAL_MS);

        request.signal.addEventListener("abort", () => {
          streamClosed = true;
          if (heartbeatTimer) clearInterval(heartbeatTimer);
          if (unsubscribe) unsubscribe();
        });

        return;
      }

      // No live session — try DB replay
      try {
        await ensureDatabase();

        const rows = await query<SessionRow>(`SELECT * FROM sessions WHERE id = '${sessionId}' LIMIT 1`);
        const sessionRow = rows[0];

        if (!sessionRow) {
          streamClosed = true;
          controller.enqueue(encode({ type: "error", message: "Session not found" }));
          controller.close();
          return;
        }

        // Replay persisted logs
        const logs = await query<SessionLogRow>(
          `SELECT log, log_type, created_at
           FROM session_logs
           WHERE session_id = '${sessionId}'
           ORDER BY id ASC`,
        );

        // Send init event
        controller.enqueue(
          encode({
            type: "init",
            message: sessionRow.label,
            data: {
              sessionType: sessionRow.session_type,
              label: sessionRow.label,
              replayed: true,
            },
          }),
        );

        // Replay log events
        for (const logRow of logs) {
          controller.enqueue(
            encode({
              type: "log",
              log: logRow.log,
              logType: logRow.log_type as SessionEvent["logType"],
            }),
          );
        }

        // Send terminal event based on session status
        const terminalStatus = sessionRow.status as string;
        if (terminalStatus === "done") {
          controller.enqueue(
            encode({
              type: "done",
              progress: 100,
              data: sessionRow.result_json ? JSON.parse(sessionRow.result_json) : {},
            }),
          );
        } else if (terminalStatus === "error") {
          controller.enqueue(
            encode({
              type: "error",
              message: sessionRow.error_message ?? "Session failed",
            }),
          );
        } else if (terminalStatus === "cancelled") {
          controller.enqueue(encode({ type: "cancelled", message: "Session cancelled" }));
        } else {
          // Session is still pending/running but not in memory — treat as error
          controller.enqueue(
            encode({
              type: "error",
              message: "Session was interrupted (server restart)",
            }),
          );
        }

        streamClosed = true;
        controller.close();
      } catch {
        streamClosed = true;
        controller.enqueue(encode({ type: "error", message: "Session not found" }));
        controller.close();
      }
    },
    cancel() {
      streamClosed = true;
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (unsubscribe) unsubscribe();
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
