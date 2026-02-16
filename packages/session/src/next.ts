import { NextResponse } from "next/server";
import type { SSEReplayCallbacks } from "./sse";
import { createSessionSSEResponse } from "./sse";
import type { SessionManager } from "./types";

type RouteContext = { params: Promise<Record<string, string>> };

/**
 * Create a GET handler for session SSE streaming.
 * Wraps `createSessionSSEResponse` with param extraction.
 */
export function createStreamHandler(opts: {
  manager: Pick<SessionManager, "getLiveSession" | "subscribe">;
  replay: SSEReplayCallbacks;
  heartbeatIntervalMs?: number;
  extractSessionId?: (params: Record<string, string>) => string;
}): (request: Request, context: RouteContext) => Promise<Response> {
  const { manager, replay, heartbeatIntervalMs, extractSessionId } = opts;

  return async (request: Request, context: RouteContext) => {
    const params = await context.params;
    const sessionId = extractSessionId ? extractSessionId(params) : (params.sessionId ?? params.id);

    return createSessionSSEResponse({
      sessionId,
      request,
      manager,
      replay,
      heartbeatIntervalMs,
    });
  };
}

/**
 * Create a POST handler for session cancellation.
 * Wraps `SessionManager.cancelSession` with param extraction and JSON response.
 */
export function createCancelHandler(opts: {
  manager: Pick<SessionManager, "cancelSession">;
  extractSessionId?: (params: Record<string, string>) => string;
}): (request: Request, context: RouteContext) => Promise<Response> {
  const { manager, extractSessionId } = opts;

  return async (_request: Request, context: RouteContext) => {
    const params = await context.params;
    const sessionId = extractSessionId ? extractSessionId(params) : (params.sessionId ?? params.id);

    try {
      const cancelled = await manager.cancelSession(sessionId);
      if (cancelled) {
        return NextResponse.json({ ok: true, status: "cancelled" });
      }
      return NextResponse.json({ error: "Session not found or not running" }, { status: 404 });
    } catch (err) {
      console.error(`[cancel] Error cancelling session ${sessionId}:`, err);
      return NextResponse.json({ error: "Failed to cancel session" }, { status: 500 });
    }
  };
}
