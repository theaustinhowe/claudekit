import { NextResponse } from "next/server";
import { createEditContentRunner } from "@/lib/claude/runners/edit-content";
import { createSession, startSession } from "@/lib/claude/session-manager";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { phase, editRequest, runId } = body;

    if (!phase || !editRequest || typeof phase !== "number" || typeof editRequest !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid phase (number) and editRequest (string)" },
        { status: 400 },
      );
    }

    const sessionId = await createSession({
      sessionType: "edit-content",
      label: `Edit phase ${phase} content`,
      runId: runId || null,
      metadata: { phase, editRequest },
    });

    const runner = createEditContentRunner(phase, editRequest);
    startSession(sessionId, runner);

    return NextResponse.json({ sessionId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
