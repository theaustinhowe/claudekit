import { createStreamHandler } from "@devkit/session/next";
import { sessionManager } from "@/lib/claude/session-manager";
import type { SessionLogRow, SessionRow } from "@/lib/claude/types";
import { getDb, queryAll } from "@/lib/db";

export const GET = createStreamHandler({
  manager: sessionManager,
  replay: {
    getSession: async (id) => {
      const conn = await getDb();
      const rows = await queryAll<SessionRow>(conn, "SELECT * FROM sessions WHERE id = ? LIMIT 1", [id]);
      return rows[0] ?? null;
    },
    getLogs: async (id) => {
      const conn = await getDb();
      const logs = await queryAll<SessionLogRow>(
        conn,
        `SELECT log, log_type, created_at
         FROM session_logs
         WHERE session_id = ?
         ORDER BY id ASC`,
        [id],
      );
      return logs;
    },
  },
  heartbeatIntervalMs: 15_000,
});
