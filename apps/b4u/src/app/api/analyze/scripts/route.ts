import { NextResponse } from "next/server";
import { createGenerateScriptsRunner } from "@/lib/claude/runners/generate-scripts";
import { createSession, startSession } from "@/lib/claude/session-manager";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { runId } = body as { runId?: string };

  const sessionId = await createSession({
    sessionType: "generate-scripts",
    label: "Generating demo scripts",
    runId: runId || null,
  });

  const runner = createGenerateScriptsRunner();
  await startSession(sessionId, runner);

  return NextResponse.json({ sessionId });
}
