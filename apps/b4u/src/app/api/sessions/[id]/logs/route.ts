import type { SessionLogRow } from "@/lib/claude/types";
import { query } from "@/lib/db";
import { ensureDatabase } from "@/lib/db-init";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: sessionId } = await params;

  await ensureDatabase();

  const logs = await query<SessionLogRow>(
    `SELECT id, session_id, log, log_type, created_at
     FROM session_logs
     WHERE session_id = '${sessionId}'
     ORDER BY id ASC`,
  );

  return Response.json({ logs });
}
