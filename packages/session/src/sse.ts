import type { SessionEvent, SessionManager } from "./types";

export interface SSEReplayCallbacks {
  getSession: (id: string) => Promise<{
    status: string;
    label?: string;
    session_type?: string;
    error_message?: string | null;
    result_json?: string | null;
  } | null>;
  getLogs: (id: string, limit?: number) => Promise<Array<{ log: string; log_type: string }>>;
}

export function createSessionSSEResponse(opts: {
  sessionId: string;
  request: Request;
  manager: Pick<SessionManager, "getLiveSession" | "subscribe">;
  replay: SSEReplayCallbacks;
  heartbeatIntervalMs?: number;
}): Response {
  const { sessionId, request, manager, replay, heartbeatIntervalMs = 15_000 } = opts;

  const encoder = new TextEncoder();
  let closed = false;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let unsubscribe: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: SessionEvent | { type: string; [key: string]: unknown }) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          closed = true;
        }
      };

      const close = () => {
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
      const live = manager.getLiveSession(sessionId);

      if (live) {
        unsubscribe = manager.subscribe(sessionId, (event) => {
          send(event);
          if (event.type === "done" || event.type === "error" || event.type === "cancelled") {
            if (heartbeatTimer) clearInterval(heartbeatTimer);
            close();
          }
        });

        if (unsubscribe) {
          heartbeatTimer = setInterval(() => {
            send({ type: "heartbeat" });
          }, heartbeatIntervalMs);
        } else {
          send({ type: "error", message: "Session not found in memory" });
          close();
        }
      } else {
        // Session not in memory — replay from DB
        (async () => {
          try {
            const session = await replay.getSession(sessionId);
            if (!session) {
              send({ type: "error", message: "Session not found" });
              close();
              return;
            }

            // Replay stored logs
            const logs = await replay.getLogs(sessionId, 500);
            for (const log of logs) {
              send({ type: "log", log: log.log, logType: log.log_type });
            }

            // Send terminal event based on session status
            if (session.status === "done") {
              const resultData = session.result_json ? JSON.parse(session.result_json) : {};
              send({ type: "done", progress: 100, data: resultData });
            } else if (session.status === "error") {
              send({ type: "error", message: session.error_message ?? "Session failed" });
            } else if (session.status === "cancelled") {
              send({ type: "cancelled", message: "Session was cancelled" });
            } else {
              // Session is still pending/running but not in memory — treat as error
              send({ type: "error", message: "Session was interrupted (server restart)" });
            }

            close();
          } catch {
            send({ type: "error", message: "Failed to load session data" });
            close();
          }
        })();
      }

      // Cleanup on client disconnect
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
