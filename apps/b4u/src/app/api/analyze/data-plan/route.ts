import { NextResponse } from "next/server";
import { createGenerateDataPlanRunner } from "@/lib/claude/runners/generate-data-plan";
import { createSession, startSession } from "@/lib/claude/session-manager";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { runId } = body as { runId?: string };

  if (!runId) {
    return NextResponse.json({ error: "runId is required" }, { status: 400 });
  }

  const sessionId = await createSession({
    sessionType: "generate-data-plan",
    label: "Generating data plan",
    runId,
  });

  const runner = createGenerateDataPlanRunner(runId);
  await startSession(sessionId, runner);

  return NextResponse.json({ sessionId });
}
