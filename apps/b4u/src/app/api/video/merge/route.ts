import { NextResponse } from "next/server";
import { createFinalMergeRunner } from "@/lib/claude/runners/final-merge";
import { createSession, startSession } from "@/lib/claude/session-manager";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { runId } = body as { runId?: string };

  const sessionId = await createSession({
    sessionType: "final-merge",
    label: "Merging final video",
    runId: runId || null,
  });

  const runner = createFinalMergeRunner(runId || undefined);
  await startSession(sessionId, runner);

  return NextResponse.json({ sessionId });
}
