import { NextResponse } from "next/server";
import { cancelSession } from "@/lib/services/session-manager";

export const dynamic = "force-dynamic";

// POST /api/sessions/[sessionId]/cancel — Cancel a running session
export async function POST(_request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;

  try {
    const cancelled = await cancelSession(sessionId);
    if (cancelled) {
      return NextResponse.json({ status: "cancelled" });
    }
    return NextResponse.json({ error: "Session not found or not running" }, { status: 404 });
  } catch (err) {
    console.error(`[cancel] Error cancelling session ${sessionId}:`, err);
    return NextResponse.json({ error: "Failed to cancel session" }, { status: 500 });
  }
}
