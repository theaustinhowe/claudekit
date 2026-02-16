import { getSessionLogsFromDb, getSessionRecord } from "@/lib/actions/sessions";
import { SESSION_HEARTBEAT_INTERVAL_MS } from "@/lib/constants";
import { getLiveSession, subscribe } from "@/lib/services/session-manager";
import type { SessionEvent } from "@/lib/types";

export const dynamic = "force-dynamic";

// GET /api/sessions/[sessionId]/stream — SSE stream with replay + live events
export async function GET(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;

  const encoder = new TextEncoder();
  let closed = false;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let unsubscribe: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: SessionEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          closed = true;
        }
      };

      const sendDone = () => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch {
          // already closed
        }
        closed = true;
      };

      // Try to subscribe to live session
      const live = getLiveSession(sessionId);

      if (live) {
        unsubscribe = subscribe(sessionId, (event: SessionEvent) => {
          send(event);

          // Close stream after terminal events
          if (event.type === "done" || event.type === "error" || event.type === "cancelled") {
            if (heartbeatTimer) clearInterval(heartbeatTimer);
            sendDone();
          }
        });

        if (unsubscribe) {
          // Heartbeat to keep connection alive
          heartbeatTimer = setInterval(() => {
            send({ type: "heartbeat" });
          }, SESSION_HEARTBEAT_INTERVAL_MS);
        } else {
          // subscribe returned null — no session
          send({ type: "error", message: "Session not found in memory" });
          sendDone();
        }
      } else {
        // Session not in memory — replay from DB
        (async () => {
          try {
            const session = await getSessionRecord(sessionId);
            if (!session) {
              send({ type: "error", message: "Session not found" });
              sendDone();
              return;
            }

            // Replay stored logs
            const logs = await getSessionLogsFromDb(sessionId, 500);
            for (const log of logs) {
              send({ type: "log", log: log.log, logType: log.log_type as SessionEvent["logType"] });
            }

            // Send terminal event based on session status
            if (session.status === "done") {
              const resultData = session.result_json ? JSON.parse(session.result_json) : {};
              send({ type: "done", progress: 100, data: resultData });
            } else if (session.status === "error") {
              send({ type: "error", message: session.error_message ?? "Session failed" });
            } else if (session.status === "cancelled") {
              send({ type: "cancelled", message: "Session was cancelled" });
            }

            sendDone();
          } catch {
            send({ type: "error", message: "Failed to load session data" });
            sendDone();
          }
        })();
      }

      // Cleanup on client disconnect (does NOT cancel the session)
      request.signal.addEventListener("abort", () => {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        unsubscribe?.();
        if (!closed) {
          try {
            controller.close();
          } catch {
            // already closed
          }
          closed = true;
        }
      });
    },
    cancel() {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      unsubscribe?.();
      closed = true;
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
