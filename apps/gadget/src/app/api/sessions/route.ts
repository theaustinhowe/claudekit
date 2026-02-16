import { type NextRequest, NextResponse } from "next/server";
import { listSessions } from "@/lib/actions/sessions";
import { createSession, startSession } from "@/lib/services/session-manager";
import { sessionRunners } from "@/lib/services/session-runners";
import type { SessionStatus, SessionType } from "@/lib/types";

export const dynamic = "force-dynamic";

// GET /api/sessions — List sessions with optional filters
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const contextId = searchParams.get("contextId");
  const contextType = searchParams.get("contextType") as "repo" | "project" | null;
  const sessionType = searchParams.get("type") as SessionType | null;
  const limit = searchParams.get("limit");

  const sessions = await listSessions({
    status: status ? (status.split(",") as SessionStatus[]) : undefined,
    contextId: contextId ?? undefined,
    contextType: contextType ?? undefined,
    sessionType: sessionType ?? undefined,
    limit: limit ? Number(limit) : undefined,
  });

  return NextResponse.json(sessions);
}

// POST /api/sessions — Create and start a new session
export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    type: sessionType,
    label,
    contextType,
    contextId,
    contextName,
    metadata = {},
  } = body as {
    type: SessionType;
    label: string;
    contextType?: "repo" | "project";
    contextId?: string;
    contextName?: string;
    metadata?: Record<string, unknown>;
  };

  if (!sessionType || !label) {
    return NextResponse.json({ error: "type and label are required" }, { status: 400 });
  }

  const runnerFactory = sessionRunners[sessionType];
  if (!runnerFactory) {
    return NextResponse.json({ error: `Unknown session type: ${sessionType}` }, { status: 400 });
  }

  try {
    // Create session record in DB
    const sessionId = await createSession({
      sessionType,
      label,
      contextType: contextType ?? null,
      contextId: contextId ?? null,
      contextName: contextName ?? null,
      metadata,
    });

    // Create runner and start session (runner executes in background;
    // await ensures the session is registered in memory before responding)
    const runner = runnerFactory(metadata, contextId);
    await startSession(sessionId, runner);

    return NextResponse.json({ sessionId }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create session" },
      { status: 500 },
    );
  }
}
