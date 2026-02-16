import { type NextRequest, NextResponse } from "next/server";
import { getLiveSession } from "@/lib/claude/session-manager";

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }

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
