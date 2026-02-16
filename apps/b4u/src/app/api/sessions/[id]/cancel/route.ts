import { NextResponse } from "next/server";
import { cancelSession } from "@/lib/claude/session-manager";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: sessionId } = await params;

  const cancelled = await cancelSession(sessionId);

  if (!cancelled) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
