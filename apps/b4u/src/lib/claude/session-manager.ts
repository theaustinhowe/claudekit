import { executePrepared, query } from "@/lib/db";
import { ensureDatabase } from "@/lib/db-init";
import type { SessionEvent, SessionRow, SessionRunner, SessionStatus, SessionType } from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SESSION_EVENT_BUFFER_SIZE = 500;
const SESSION_LOG_FLUSH_INTERVAL_MS = 5000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
// Internal: DB helpers (inline, no server actions)
// ---------------------------------------------------------------------------

async function insertSessionRecord(
  id: string,
  opts: {
    sessionType: SessionType;
    label: string;
    projectPath?: string | null;
    runId?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const now = new Date().toISOString();
  await executePrepared(
    `INSERT INTO sessions (id, session_type, status, label, project_path, run_id, result_json, created_at)
     VALUES ($id, $session_type, 'pending', $label, $project_path, $run_id, $result_json, $created_at)`,
    {
      id,
      session_type: opts.sessionType,
      label: opts.label,
      project_path: opts.projectPath ?? null,
      run_id: opts.runId ?? null,
      result_json: opts.metadata ? JSON.stringify(opts.metadata) : null,
      created_at: now,
    },
  );
}

async function getSessionRecord(sessionId: string): Promise<SessionRow | null> {
  const rows = await query<SessionRow>(`SELECT * FROM sessions WHERE id = '${sessionId}' LIMIT 1`);
  return rows[0] ?? null;
}

async function updateSessionRecord(
  sessionId: string,
  updates: Partial<{
    status: string;
    started_at: string;
    completed_at: string;
    progress: number;
    phase: string;
    pid: number;
    error_message: string;
    result_json: string;
  }>,
): Promise<void> {
  const setClauses: string[] = [];
  const params: Record<string, string | number | boolean | null> = {
    id: sessionId,
  };

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      setClauses.push(`${key} = $${key}`);
      params[key] = value as string | number | null;
    }
  }

  if (setClauses.length === 0) return;

  await executePrepared(`UPDATE sessions SET ${setClauses.join(", ")} WHERE id = $id`, params);
}

async function insertSessionLogs(sessionId: string, logs: Array<{ log: string; logType: string }>): Promise<void> {
  for (const entry of logs) {
    const now = new Date().toISOString();
    await executePrepared(
      `INSERT INTO session_logs (session_id, log, log_type, created_at)
       VALUES ($session_id, $log, $log_type, $created_at)`,
      {
        session_id: sessionId,
        log: entry.log,
        log_type: entry.logType,
        created_at: now,
      },
    );
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function flushLogs(session: LiveSession): Promise<void> {
  if (session.pendingLogs.length === 0) return;
  const batch = session.pendingLogs.splice(0);
  try {
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
 * Create a session record in DB (status=pending) and return the session ID.
 */
export async function createSession(opts: {
  sessionType: SessionType;
  label: string;
  projectPath?: string | null;
  runId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<string> {
  await ensureDatabase();
  const id = crypto.randomUUID();
  await insertSessionRecord(id, opts);
  return id;
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

  // Load session from DB to get metadata
  const row = await getSessionRecord(sessionId);
  if (!row) throw new Error(`Session ${sessionId} not found`);

  const abortController = new AbortController();

  const session: LiveSession = {
    id: sessionId,
    sessionType: row.session_type as SessionType,
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
 * Update the PID of a running session in the DB.
 */
async function _setSessionPid(sessionId: string, pid: number): Promise<void> {
  const session = getSessions().get(sessionId);
  if (session) {
    await updateSessionRecord(sessionId, { pid }).catch(() => {});
  }
}
