import { NextResponse } from "next/server";
import { getSessionLogsFromDb, getSessionRecord } from "@/lib/actions/sessions";
import { getLiveSession } from "@/lib/services/session-manager";

export const dynamic = "force-dynamic";

// GET /api/sessions/[sessionId] — Session detail + recent logs
export async function GET(_request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;

  // Check live session first for most up-to-date data
  const live = getLiveSession(sessionId);
  if (live) {
    const recentLogs = live.events
      .filter((e) => e.log)
      .slice(-50)
      .map((e) => ({ log: e.log as string, logType: e.logType ?? "status" }));

    return NextResponse.json({
      id: live.id,
      session_type: live.sessionType,
      status: live.status,
      label: live.label,
      recentLogs,
    });
  }

  // Fall back to DB
  const session = await getSessionRecord(sessionId);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const logs = await getSessionLogsFromDb(sessionId, 50);
  return NextResponse.json({
    ...session,
    recentLogs: logs.map((l) => ({ log: l.log, logType: l.log_type })),
  });
}
