import { createSessionManager } from "@devkit/session";
import { execute, getDb, queryAll, queryOne } from "@/lib/db";
import type { SessionRow, SessionType } from "./types";

// ---------------------------------------------------------------------------
// createSession stays app-specific (inline DB insert)
// ---------------------------------------------------------------------------

export async function createSession(opts: {
  sessionType: SessionType;
  label: string;
  projectPath?: string | null;
  runId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<string> {
  const conn = await getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await execute(
    conn,
    `INSERT INTO sessions (id, session_type, status, label, project_path, run_id, result_json, created_at)
     VALUES (?, ?, 'pending', ?, ?, ?, ?, ?)`,
    [
      id,
      opts.sessionType,
      opts.label,
      opts.projectPath ?? null,
      opts.runId ?? null,
      opts.metadata ? JSON.stringify(opts.metadata) : null,
      now,
    ],
  );
  return id;
}

// ---------------------------------------------------------------------------
// Shared session manager with app-specific persistence callbacks
// ---------------------------------------------------------------------------

const manager = createSessionManager({
  persistence: {
    loadSession: async (id) => {
      const conn = await getDb();
      const row = await queryOne<SessionRow>(conn, "SELECT * FROM sessions WHERE id = ? LIMIT 1", [id]);
      if (!row) return null;
      return { session_type: row.session_type, label: row.label, status: row.status, pid: row.pid ?? null };
    },
    updateSession: async (sessionId, updates) => {
      const setClauses: string[] = [];
      const params: unknown[] = [];

      for (const [key, value] of Object.entries(updates)) {
        if (value !== undefined) {
          setClauses.push(`${key} = ?`);
          params.push(value);
        }
      }

      if (setClauses.length === 0) return;
      params.push(sessionId);
      const conn = await getDb();
      await execute(conn, `UPDATE sessions SET ${setClauses.join(", ")} WHERE id = ?`, params);
    },
    persistLogs: async (sessionId, logs) => {
      const conn = await getDb();
      for (const entry of logs) {
        const now = new Date().toISOString();
        await execute(
          conn,
          `INSERT INTO session_logs (session_id, log, log_type, created_at)
           VALUES (?, ?, ?, ?)`,
          [sessionId, entry.log, entry.logType, now],
        );
      }
    },
  },
  eventBufferSize: 500,
  logFlushIntervalMs: 5000,
});

// Re-export manager methods for drop-in compatibility (no consumer changes needed)
export const { startSession, cancelSession, subscribe, getLiveSession } = manager;

// Export the manager instance itself (needed by SSE route)
export { manager as sessionManager };

// ---------------------------------------------------------------------------
// Session recovery — check for in-progress or recent sessions
// ---------------------------------------------------------------------------

interface RecoverableSession {
  id: string;
  sessionType: string;
  status: string;
  label: string;
  runId: string | null;
  createdAt: string;
}

export async function getRecoverableSessions(runId?: string): Promise<RecoverableSession[]> {
  const conn = await getDb();
  const query = runId
    ? "SELECT id, session_type, status, label, run_id, created_at FROM sessions WHERE run_id = ? AND status IN ('running', 'pending', 'error') ORDER BY created_at DESC"
    : "SELECT id, session_type, status, label, run_id, created_at FROM sessions WHERE status IN ('running', 'pending', 'error') ORDER BY created_at DESC LIMIT 10";
  const params = runId ? [runId] : [];

  const rows = await queryAll<{
    id: string;
    session_type: string;
    status: string;
    label: string;
    run_id: string | null;
    created_at: string;
  }>(conn, query, params);

  return rows.map((r) => ({
    id: r.id,
    sessionType: r.session_type,
    status: r.status,
    label: r.label,
    runId: r.run_id,
    createdAt: r.created_at,
  }));
}

export async function getSessionStatus(sessionId: string): Promise<SessionRow | null> {
  const conn = await getDb();
  return (await queryOne<SessionRow>(conn, "SELECT * FROM sessions WHERE id = ? LIMIT 1", [sessionId])) ?? null;
}
