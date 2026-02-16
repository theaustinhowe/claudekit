import type { SessionLogRow } from "@/lib/claude/types";
import { getDb, queryAll } from "@/lib/db";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: sessionId } = await params;

  const conn = await getDb();
  const logs = await queryAll<SessionLogRow>(
    conn,
    `SELECT id, session_id, log, log_type, created_at
     FROM session_logs
     WHERE session_id = ?
     ORDER BY id ASC`,
    [sessionId],
  );

  return Response.json({ logs });
}
