import { NextResponse } from "next/server";
import { createSession } from "@/lib/claude/session-manager";

export async function POST(request: Request) {
  const body = await request.json();
  const { sessionType, label, projectPath } = body;

  if (!sessionType || !label) {
    return NextResponse.json({ error: "sessionType and label required" }, { status: 400 });
  }

  const id = await createSession({ sessionType, label, projectPath });
  return NextResponse.json({ id });
}
