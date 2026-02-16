import { type NextRequest, NextResponse } from "next/server";
import { getLiveSession, getRecoverableSessions } from "@/lib/claude/session-manager";

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("sessionId");
  const runId = request.nextUrl.searchParams.get("runId");

  // If sessionId provided, return live session info
  if (sessionId) {
    const session = getLiveSession(sessionId);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: session.id,
      status: session.status,
      events: session.events.slice(-20), // Last 20 events
    });
  }

  // Otherwise, return recoverable sessions for this run
  try {
    const sessions = await getRecoverableSessions(runId || undefined);

    const recordingSessions = sessions.filter(
      (s) => s.sessionType === "recording" || s.sessionType === "voiceover-audio" || s.sessionType === "video-merge",
    );

    return NextResponse.json({
      sessions: recordingSessions,
      hasRecoverable: recordingSessions.some((s) => s.status === "running" || s.status === "error"),
    });
  } catch (error) {
    console.error("Failed to fetch recording status:", error);
    return NextResponse.json({ sessions: [], hasRecoverable: false }, { status: 200 });
  }
}
