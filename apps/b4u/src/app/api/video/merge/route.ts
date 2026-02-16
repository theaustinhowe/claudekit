import { NextResponse } from "next/server";
import { createFinalMergeRunner } from "@/lib/claude/runners/final-merge";
import { createSession, startSession } from "@/lib/claude/session-manager";

export async function POST() {
  const sessionId = await createSession({
    sessionType: "final-merge",
    label: "Merging final video",
  });

  const runner = createFinalMergeRunner();
  await startSession(sessionId, runner);

  return NextResponse.json({ sessionId });
}
