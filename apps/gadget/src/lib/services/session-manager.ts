import { SESSION_EVENT_BUFFER_SIZE, SESSION_LOG_FLUSH_INTERVAL_MS } from "@/lib/constants";
import type { SessionEvent, SessionStatus, SessionType } from "@/lib/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SessionRunner = (ctx: {
  onProgress: (event: SessionEvent) => void;
  signal: AbortSignal;
  sessionId: string;
}) => Promise<{ result?: Record<string, unknown> }>;

type SessionSubscriber = (event: SessionEvent) => void;

interface LiveSession {
  id: string;
  sessionType: SessionType;
  status: SessionStatus;
  label: string;
  events: SessionEvent[];
  subscribers: Set<SessionSubscriber>;
  abortController: AbortController;
  cleanupFn: (() => Promise<void>) | null;
  completionPromise: Promise<void>;
  pendingLogs: Array<{ log: string; logType: string }>;
  logFlushTimer: ReturnType<typeof setInterval> | null;
}

// ---------------------------------------------------------------------------
// globalThis-cached singleton (survives Next.js HMR)
// ---------------------------------------------------------------------------

const globalForSessions = globalThis as typeof globalThis & {
  __session_manager?: Map<string, LiveSession>;
};

function getSessions(): Map<string, LiveSession> {
  if (!globalForSessions.__session_manager) {
    globalForSessions.__session_manager = new Map();
  }
  return globalForSessions.__session_manager;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function flushLogs(session: LiveSession): Promise<void> {
  if (session.pendingLogs.length === 0) return;
  const batch = session.pendingLogs.splice(0);
  try {
    const { insertSessionLogs } = await import("@/lib/actions/sessions");
    await insertSessionLogs(session.id, batch);
  } catch {
    // DB write failed — logs are lost but session continues
  }
}

function fanOut(session: LiveSession, event: SessionEvent): void {
  // Buffer event (ring buffer)
  session.events.push(event);
  if (session.events.length > SESSION_EVENT_BUFFER_SIZE) {
    session.events.shift();
  }

  // Collect logs for batch persistence
  if (event.log) {
    session.pendingLogs.push({ log: event.log, logType: event.logType ?? "status" });
  }

  // Fan out to subscribers
  for (const sub of session.subscribers) {
    try {
      sub(event);
    } catch {
      // Ignore subscriber errors
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a session record in DB (status=pending) and prepare in-memory state.
 */
export async function createSession(opts: {
  sessionType: SessionType;
  label: string;
  contextType?: "repo" | "project" | null;
  contextId?: string | null;
  contextName?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<string> {
  const { createSessionRecord } = await import("@/lib/actions/sessions");
  return createSessionRecord(opts);
}

/**
 * Start executing a session. Transitions to 'running', invokes the runner,
 * and updates DB on completion/error/cancel.
 */
export async function startSession(sessionId: string, runner: SessionRunner): Promise<LiveSession> {
  const sessions = getSessions();

  // Guard against duplicate starts
  const existing = sessions.get(sessionId);
  if (existing && (existing.status === "running" || existing.status === "pending")) {
    return existing;
  }

  const { updateSessionRecord, getSessionRecord } = await import("@/lib/actions/sessions");

  // Load session from DB to get metadata
  const row = await getSessionRecord(sessionId);
  if (!row) throw new Error(`Session ${sessionId} not found`);

  const abortController = new AbortController();

  const session: LiveSession = {
    id: sessionId,
    sessionType: row.session_type,
    status: "running",
    label: row.label,
    events: [],
    subscribers: new Set(),
    abortController,
    cleanupFn: null,
    completionPromise: Promise.resolve(),
    pendingLogs: [],
    logFlushTimer: null,
  };

  // Start periodic log flushing
  session.logFlushTimer = setInterval(() => {
    flushLogs(session);
  }, SESSION_LOG_FLUSH_INTERVAL_MS);

  // Update DB to running
  const startedAt = new Date().toISOString();
  await updateSessionRecord(sessionId, { status: "running", started_at: startedAt });

  // Send init event
  fanOut(session, {
    type: "init",
    message: `Starting ${row.label}`,
    data: { sessionType: row.session_type, label: row.label },
  });

  // Execute runner in background
  session.completionPromise = (async () => {
    try {
      const { result } = await runner({
        onProgress: (event) => {
          // Update session progress state
          if (event.progress !== undefined) session.status = "running";
          fanOut(session, event);

          // Update DB progress periodically
          if (event.progress !== undefined || event.phase) {
            updateSessionRecord(sessionId, {
              progress: event.progress ?? undefined,
              phase: event.phase ?? undefined,
            }).catch(() => {});
          }
        },
        signal: abortController.signal,
        sessionId,
      });

      // Flush remaining logs
      if (session.logFlushTimer) clearInterval(session.logFlushTimer);
      session.logFlushTimer = null;
      await flushLogs(session);

      // Mark done
      session.status = "done";
      const completedAt = new Date().toISOString();
      await updateSessionRecord(sessionId, {
        status: "done",
        progress: 100,
        completed_at: completedAt,
        result_json: JSON.stringify(result ?? {}),
      });

      fanOut(session, { type: "done", progress: 100, data: result });
    } catch (err) {
      // Flush remaining logs
      if (session.logFlushTimer) clearInterval(session.logFlushTimer);
      session.logFlushTimer = null;
      await flushLogs(session);

      const isAbort = err instanceof DOMException && err.name === "AbortError";

      if (isAbort) {
        session.status = "cancelled";
        const completedAt = new Date().toISOString();
        await updateSessionRecord(sessionId, {
          status: "cancelled",
          completed_at: completedAt,
          error_message: "Cancelled by user",
        });
        fanOut(session, { type: "cancelled", message: "Session cancelled" });
      } else {
        const errorMsg = err instanceof Error ? err.message : String(err);
        session.status = "error";
        const completedAt = new Date().toISOString();
        await updateSessionRecord(sessionId, {
          status: "error",
          completed_at: completedAt,
          error_message: errorMsg,
        });
        fanOut(session, { type: "error", message: errorMsg });
      }

      // Run cleanup function if registered
      if (session.cleanupFn) {
        try {
          await session.cleanupFn();
        } catch {
          // Ignore cleanup errors
        }
      }
    } finally {
      // Clear subscribers after terminal event
      session.subscribers.clear();
    }
  })();

  sessions.set(sessionId, session);
  return session;
}

/**
 * Cancel a running session. Aborts the signal, which kills the Claude process.
 */
export async function cancelSession(sessionId: string): Promise<boolean> {
  const session = getSessions().get(sessionId);

  if (session && session.status === "running") {
    session.abortController.abort();
    // The runner catch block handles the rest (DB update, cleanup, events)
    return true;
  }

  // Fallback: orphaned session with no in-memory LiveSession (e.g. after server restart).
  // Mark it cancelled in DB directly and try to kill the process if a PID was stored.
  const { getSessionRecord, updateSessionRecord } = await import("@/lib/actions/sessions");
  const record = await getSessionRecord(sessionId);

  if (!record || (record.status !== "running" && record.status !== "pending")) {
    return false;
  }

  if (record.pid) {
    try {
      process.kill(record.pid, "SIGTERM");
    } catch {
      // PID already gone
    }
  }

  await updateSessionRecord(sessionId, {
    status: "cancelled",
    completed_at: new Date().toISOString(),
    error_message: "Cancelled (orphaned session)",
  });
  return true;
}

/**
 * Subscribe to a session's events. Replays buffered events, then adds
 * the callback to the live subscriber set.
 * Returns an unsubscribe function, or null if session not found.
 */
export function subscribe(sessionId: string, callback: SessionSubscriber): (() => void) | null {
  const session = getSessions().get(sessionId);
  if (!session) return null;

  // Replay buffered events
  for (const event of session.events) {
    try {
      callback(event);
    } catch {
      // Ignore replay errors
    }
  }

  // If session is already finished, no need to add subscriber
  if (session.status !== "running" && session.status !== "pending") {
    return () => {};
  }

  session.subscribers.add(callback);
  return () => {
    session.subscribers.delete(callback);
  };
}

/**
 * Get a live session by ID.
 */
export function getLiveSession(sessionId: string): LiveSession | undefined {
  return getSessions().get(sessionId);
}

/**
 * Register a cleanup function for a session (e.g., worktree removal).
 */
export function setCleanupFn(sessionId: string, fn: () => Promise<void>): void {
  const session = getSessions().get(sessionId);
  if (session) {
    session.cleanupFn = fn;
  }
}

/**
 * Update the PID of a running session.
 */
export async function setSessionPid(sessionId: string, pid: number): Promise<void> {
  const session = getSessions().get(sessionId);
  if (session) {
    const { updateSessionRecord } = await import("@/lib/actions/sessions");
    await updateSessionRecord(sessionId, { pid }).catch(() => {});
  }
}
