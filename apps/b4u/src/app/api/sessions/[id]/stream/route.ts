import { createSessionSSEResponse } from "@devkit/session";
import { sessionManager } from "@/lib/claude/session-manager";
import type { SessionLogRow, SessionRow } from "@/lib/claude/types";
import { query } from "@/lib/db";
import { ensureDatabase } from "@/lib/db-init";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: sessionId } = await params;

  return createSessionSSEResponse({
    sessionId,
    request,
    manager: sessionManager,
    replay: {
      getSession: async (id) => {
        await ensureDatabase();
        const rows = await query<SessionRow>(`SELECT * FROM sessions WHERE id = '${id}' LIMIT 1`);
        return rows[0] ?? null;
      },
      getLogs: async (id) => {
        const logs = await query<SessionLogRow>(
          `SELECT log, log_type, created_at
           FROM session_logs
           WHERE session_id = '${id}'
           ORDER BY id ASC`,
        );
        return logs;
      },
    },
    heartbeatIntervalMs: 15_000,
  });
}
