/**
 * Session Bridge — Integrates @claudekit/session with GoGo Orchestrator.
 *
 * Key design decisions:
 * - Uses dedicated sessions/session_logs tables (001_initial.sql)
 * - Sessions track individual Claude process runs within the job lifecycle
 * - GoGo's state machine remains authoritative for job status
 * - useGlobalCache: false (Fastify, not Next.js)
 * - emitEvent() allows external code (emitLog) to route through the session
 */

import { execute, queryOne } from "@claudekit/duckdb";
import { createSessionManager } from "@claudekit/session";
import { getDb } from "../db/index.js";

interface DbSession {
  id: string;
  session_type: string;
  status: string;
  label: string;
  context_type: string | null;
  context_id: string | null;
  context_name: string | null;
  metadata_json: string;
  progress: number;
  phase: string | null;
  pid: number | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  error_message: string | null;
  result_json: string;
}

const manager = createSessionManager({
  persistence: {
    loadSession: async (id: string) => {
      const conn = await getDb();
      const row = await queryOne<DbSession>(conn, "SELECT * FROM sessions WHERE id = ?", [id]);
      if (!row) return null;
      return {
        session_type: row.session_type,
        label: row.label,
        status: row.status,
        pid: row.pid ?? null,
      };
    },

    updateSession: async (id: string, updates: Record<string, unknown>) => {
      const conn = await getDb();
      const sets: string[] = [];
      const params: unknown[] = [];

      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined) continue;
        sets.push(`${key} = ?`);
        params.push(value);
      }

      if (sets.length === 0) return;
      params.push(id);
      await execute(conn, `UPDATE sessions SET ${sets.join(", ")} WHERE id = ?`, params);
    },

    persistLogs: async (id: string, logs: Array<{ log: string; logType: string }>) => {
      if (logs.length === 0) return;
      const conn = await getDb();
      const now = new Date().toISOString();
      for (const entry of logs) {
        await execute(conn, "INSERT INTO session_logs (session_id, log, log_type, created_at) VALUES (?, ?, ?, ?)", [
          id,
          entry.log,
          entry.logType,
          now,
        ]);
      }
    },
  },

  eventBufferSize: 500,
  logFlushIntervalMs: 2000,
  useGlobalCache: false,
});

// ---------------------------------------------------------------------------
// Session record CRUD
// ---------------------------------------------------------------------------

export async function createSessionRecord(opts: {
  id: string;
  sessionType?: string;
  label: string;
  contextType?: string;
  contextId?: string;
  contextName?: string;
  metadata?: Record<string, unknown>;
}): Promise<string> {
  const conn = await getDb();
  const now = new Date().toISOString();
  await execute(
    conn,
    `INSERT INTO sessions (id, session_type, status, label, context_type, context_id, context_name, metadata_json, created_at)
     VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?)`,
    [
      opts.id,
      opts.sessionType ?? "claude_run",
      opts.label,
      opts.contextType ?? null,
      opts.contextId ?? null,
      opts.contextName ?? null,
      JSON.stringify(opts.metadata ?? {}),
      now,
    ],
  );
  return opts.id;
}

// ---------------------------------------------------------------------------
// Active session tracking (for parallel job limit enforcement)
// ---------------------------------------------------------------------------

const activeSessionIds = new Set<string>();

/** Get the number of currently active sessions */
export function getActiveSessionCount(): number {
  return activeSessionIds.size;
}

/** Track a session as active (called on start, cleaned up on complete) */
export function trackSession(sessionId: string): void {
  activeSessionIds.add(sessionId);
}

/** Remove a session from active tracking */
export function untrackSession(sessionId: string): void {
  activeSessionIds.delete(sessionId);
}

// ---------------------------------------------------------------------------
// Export session manager methods
// ---------------------------------------------------------------------------

export const { startSession, cancelSession, subscribe, getLiveSession, setCleanupFn, setSessionPid, emitEvent } =
  manager;
export { manager as sessionManager };

// ---------------------------------------------------------------------------
// Process termination utility
// ---------------------------------------------------------------------------

/**
 * Safe process termination: SIGTERM → wait 5s → SIGKILL.
 * Used as the session cleanup function.
 */
export async function safeTerminateProcess(pid: number): Promise<boolean> {
  const processExists = (p: number): boolean => {
    try {
      process.kill(p, 0);
      return true;
    } catch {
      return false;
    }
  };

  if (!processExists(pid)) return false;

  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return false;
  }

  const startTime = Date.now();
  const timeout = 5000;

  while (Date.now() - startTime < timeout) {
    if (!processExists(pid)) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  try {
    process.kill(pid, "SIGKILL");
    return true;
  } catch {
    return !processExists(pid);
  }
}
