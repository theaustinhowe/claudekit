import { NextResponse } from "next/server";
import { createGenerateOutlineRunner } from "@/lib/claude/runners/generate-outline";
import { createSession, startSession } from "@/lib/claude/session-manager";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { runId } = body as { runId?: string };

  const sessionId = await createSession({
    sessionType: "generate-outline",
    label: "Generating app outline",
    runId: runId || null,
  });

  const runner = createGenerateOutlineRunner();
  await startSession(sessionId, runner);

  return NextResponse.json({ sessionId });
}
