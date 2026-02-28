import { NextResponse } from "next/server";
import type { SSEReplayCallbacks } from "./sse";
import { createSessionSSEResponse } from "./sse";
import type { LiveSession, SessionManager, SessionRowBase, SessionRunner } from "./types";

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

// ---------------------------------------------------------------------------
// Cleanup handler — stop all running/pending sessions
// ---------------------------------------------------------------------------

/**
 * Create GET + POST handlers for bulk session cleanup.
 * - **GET** returns currently active sessions and their count.
 * - **POST** cancels every active session and returns a summary.
 */
export function createCleanupHandler<TRow extends SessionRowBase = SessionRowBase>(opts: {
  listSessions(filter?: ListSessionsFilter): Promise<TRow[]>;
  manager: Pick<SessionManager, "cancelSession">;
}): {
  GET: (request: Request) => Promise<Response>;
  POST: (request: Request) => Promise<Response>;
} {
  const { listSessions, manager } = opts;

  const getActiveSessions = () => listSessions({ status: ["running", "pending"] });

  return {
    async GET() {
      try {
        const sessions = await getActiveSessions();
        return NextResponse.json({ sessions, count: sessions.length });
      } catch (err) {
        console.error("[cleanup] Error listing active sessions:", err);
        return NextResponse.json({ error: "Failed to list sessions" }, { status: 500 });
      }
    },

    async POST() {
      try {
        const sessions = await getActiveSessions();
        let stopped = 0;
        let failed = 0;

        for (const session of sessions) {
          try {
            await manager.cancelSession(session.id);
            stopped++;
          } catch {
            failed++;
          }
        }

        return NextResponse.json({ stopped, failed, total: sessions.length });
      } catch (err) {
        console.error("[cleanup] Error during bulk cleanup:", err);
        return NextResponse.json({ error: "Failed to clean up sessions" }, { status: 500 });
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Session POST handler — create + start a session
// ---------------------------------------------------------------------------

/**
 * Create a POST handler for creating and starting a session.
 * Apps inject their own `createSession`, `startSession`, and `sessionRunners`.
 */
export function createSessionPOSTHandler(opts: {
  createSession(params: {
    sessionType: string;
    label: string;
    contextType?: string | null;
    contextId?: string | null;
    contextName?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<string>;
  startSession: (sessionId: string, runner: SessionRunner) => Promise<LiveSession>;
  sessionRunners: Record<string, (metadata: Record<string, unknown>, contextId?: string) => SessionRunner>;
}): (request: Request) => Promise<Response> {
  const { createSession, startSession, sessionRunners } = opts;

  return async (request: Request) => {
    const body = await request.json();
    const {
      type: sessionType,
      label,
      contextType,
      contextId,
      contextName,
      metadata = {},
    } = body as {
      type: string;
      label: string;
      contextType?: string;
      contextId?: string;
      contextName?: string;
      metadata?: Record<string, unknown>;
    };

    if (!sessionType || !label) {
      return NextResponse.json({ error: "type and label are required" }, { status: 400 });
    }

    const runnerFactory = sessionRunners[sessionType];
    if (!runnerFactory) {
      return NextResponse.json({ error: `Unknown session type: ${sessionType}` }, { status: 400 });
    }

    try {
      const sessionId = await createSession({
        sessionType,
        label,
        contextType: contextType ?? null,
        contextId: contextId ?? null,
        contextName: contextName ?? null,
        metadata,
      });

      const runner = runnerFactory(metadata, contextId);
      await startSession(sessionId, runner);

      return NextResponse.json({ sessionId }, { status: 201 });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Failed to create session" },
        { status: 500 },
      );
    }
  };
}

// ---------------------------------------------------------------------------
// Session list handler
// ---------------------------------------------------------------------------

export interface ListSessionsFilter {
  status?: string | string[];
  contextId?: string;
  contextType?: string;
  sessionType?: string;
  limit?: number;
}

/**
 * Create a GET handler for listing sessions.
 * Apps inject their own `listSessions` DB query function.
 */
export function createSessionsListHandler<TRow extends SessionRowBase = SessionRowBase>(opts: {
  listSessions(filter?: ListSessionsFilter): Promise<TRow[]>;
}): (request: Request) => Promise<Response> {
  const { listSessions } = opts;

  return async (request: Request) => {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const contextId = searchParams.get("contextId");
    const contextType = searchParams.get("contextType");
    const sessionType = searchParams.get("type");
    const limit = searchParams.get("limit");

    try {
      const sessions = await listSessions({
        status: status ? status.split(",") : undefined,
        contextId: contextId ?? undefined,
        contextType: contextType ?? undefined,
        sessionType: sessionType ?? undefined,
        limit: limit ? Number(limit) : undefined,
      });

      return NextResponse.json(sessions);
    } catch (err) {
      console.error("[sessions] Error listing sessions:", err);
      return NextResponse.json({ error: "Failed to list sessions" }, { status: 500 });
    }
  };
}
