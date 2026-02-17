import { NextResponse } from "next/server";
import { createRecordingRunner } from "@/lib/claude/runners/recording";
import { createSession, startSession } from "@/lib/claude/session-manager";

export async function POST(request: Request) {
  const { projectPath, flowIds, runId } = await request.json();

  if (!projectPath) {
    return NextResponse.json({ error: "projectPath is required" }, { status: 400 });
  }

  const sessionId = await createSession({
    sessionType: "recording",
    label: "Recording flows",
    projectPath,
    runId: runId || null,
  });

  const runner = createRecordingRunner(projectPath, flowIds, runId || undefined);
  await startSession(sessionId, runner);

  return NextResponse.json({ sessionId });
}
