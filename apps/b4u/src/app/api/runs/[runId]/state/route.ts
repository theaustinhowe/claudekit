import { NextResponse } from "next/server";
import { execute, getDb } from "@/lib/db";

async function saveState(
  runId: string,
  body: {
    currentPhase: string;
    phaseStatuses: unknown;
    activeThreadIds?: unknown;
    projectPath?: string;
    projectName?: string;
    // Legacy fields for backward compat
    messages?: unknown;
  },
) {
  const { currentPhase, phaseStatuses, activeThreadIds, projectPath, projectName } = body;

  if (!currentPhase || !phaseStatuses) {
    return NextResponse.json({ error: "currentPhase and phaseStatuses are required" }, { status: 400 });
  }

  const conn = await getDb();

  await execute(
    conn,
    `INSERT INTO run_state (run_id, messages_json, current_phase, phase_statuses_json, project_path, project_name, threads_json, updated_at)
     VALUES (?, '[]', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT (run_id) DO UPDATE SET
       current_phase = excluded.current_phase,
       phase_statuses_json = excluded.phase_statuses_json,
       project_path = COALESCE(excluded.project_path, run_state.project_path),
       project_name = COALESCE(excluded.project_name, run_state.project_name),
       threads_json = COALESCE(excluded.threads_json, run_state.threads_json),
       updated_at = CURRENT_TIMESTAMP`,
    [
      runId,
      currentPhase,
      JSON.stringify(phaseStatuses),
      projectPath ?? null,
      projectName ?? null,
      activeThreadIds ? JSON.stringify(activeThreadIds) : null,
    ],
  );

  return NextResponse.json({ ok: true });
}

export async function PUT(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;

  if (!runId || typeof runId !== "string") {
    return NextResponse.json({ error: "runId is required" }, { status: 400 });
  }

  try {
    const body = await request.json();
    return await saveState(runId, body);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to save state" }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;

  if (!runId || typeof runId !== "string") {
    return NextResponse.json({ error: "runId is required" }, { status: 400 });
  }

  try {
    const body = await request.json();
    return await saveState(runId, body);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to save state" }, { status: 500 });
  }
}
