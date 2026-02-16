import { createSessionManager } from "@devkit/session";
import { executePrepared, query } from "@/lib/db";
import { ensureDatabase } from "@/lib/db-init";
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
  await ensureDatabase();
  const id = crypto.randomUUID();
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
  return id;
}

// ---------------------------------------------------------------------------
// Shared session manager with app-specific persistence callbacks
// ---------------------------------------------------------------------------

const manager = createSessionManager({
  persistence: {
    loadSession: async (id) => {
      const rows = await query<SessionRow>(`SELECT * FROM sessions WHERE id = '${id}' LIMIT 1`);
      const row = rows[0];
      if (!row) return null;
      return { session_type: row.session_type, label: row.label, status: row.status, pid: row.pid ?? null };
    },
    updateSession: async (sessionId, updates) => {
      const setClauses: string[] = [];
      const params: Record<string, string | number | boolean | null> = { id: sessionId };

      for (const [key, value] of Object.entries(updates)) {
        if (value !== undefined) {
          setClauses.push(`${key} = $${key}`);
          params[key] = value as string | number | null;
        }
      }

      if (setClauses.length === 0) return;
      await executePrepared(`UPDATE sessions SET ${setClauses.join(", ")} WHERE id = $id`, params);
    },
    persistLogs: async (sessionId, logs) => {
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
    },
  },
  eventBufferSize: 500,
  logFlushIntervalMs: 5000,
});

// Re-export manager methods for drop-in compatibility (no consumer changes needed)
export const { startSession, cancelSession, subscribe, getLiveSession } = manager;

// Export the manager instance itself (needed by SSE route)
export { manager as sessionManager };
