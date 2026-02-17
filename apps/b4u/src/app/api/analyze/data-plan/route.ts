import { NextResponse } from "next/server";
import { createGenerateDataPlanRunner } from "@/lib/claude/runners/generate-data-plan";
import { createSession, startSession } from "@/lib/claude/session-manager";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { runId } = body as { runId?: string };

  const sessionId = await createSession({
    sessionType: "generate-data-plan",
    label: "Generating data plan",
    runId: runId || null,
  });

  const runner = createGenerateDataPlanRunner(runId || undefined);
  await startSession(sessionId, runner);

  return NextResponse.json({ sessionId });
}
