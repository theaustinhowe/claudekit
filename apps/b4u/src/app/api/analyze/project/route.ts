import { NextResponse } from "next/server";
import { createAnalyzeProjectRunner } from "@/lib/claude/runners/analyze-project";
import { createSession, startSession } from "@/lib/claude/session-manager";

export async function POST(request: Request) {
  const { path, runId } = await request.json();

  if (!path || typeof path !== "string") {
    return NextResponse.json({ error: "path is required" }, { status: 400 });
  }

  const sessionId = await createSession({
    sessionType: "analyze-project",
    label: "Analyzing project",
    projectPath: path,
    runId: runId || null,
  });

  const runner = createAnalyzeProjectRunner(path, runId || undefined);
  await startSession(sessionId, runner);

  return NextResponse.json({ sessionId });
}
