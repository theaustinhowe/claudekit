import { NextResponse } from "next/server";
import { execute, getDb, queryAll } from "@/lib/db";

type SessionRow = {
  id: string;
  session_type: string;
  status: string;
  project_path: string | null;
  created_at: string | null;
};

type RunStateRow = {
  messages_json: string;
  current_phase: number;
  phase_statuses_json: string;
  project_path: string | null;
  project_name: string | null;
};

const SESSION_TYPE_PHASE: Record<string, number> = {
  "analyze-project": 1,
  "generate-outline": 2,
  "generate-data-plan": 3,
  "generate-scripts": 4,
  recording: 5,
  "voiceover-audio": 6,
  "final-merge": 7,
};

type Phase = 1 | 2 | 3 | 4 | 5 | 6 | 7;
type PhaseStatus = "locked" | "active" | "completed";

function basename(path: string): string {
  return path.split("/").filter(Boolean).pop() || path;
}

export async function GET(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;

  if (!runId || typeof runId !== "string") {
    return NextResponse.json({ error: "runId is required" }, { status: 400 });
  }

  try {
    const conn = await getDb();

    // Query both tables -- run_state may exist without sessions (phase 1)
    const stateRows = await queryAll<RunStateRow>(
      conn,
      `SELECT messages_json, current_phase, phase_statuses_json, project_path, project_name
       FROM run_state
       WHERE run_id = ?`,
      [runId],
    );

    const sessionRows = await queryAll<SessionRow>(
      conn,
      `SELECT id, session_type, status, project_path, created_at
       FROM sessions
       WHERE run_id = ?
       ORDER BY created_at ASC`,
      [runId],
    );

    // If neither exists, this run doesn't exist
    if (stateRows.length === 0 && sessionRows.length === 0) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    // If run_state exists, prefer its data
    if (stateRows.length > 0) {
      const rs = stateRows[0];
      const messages = JSON.parse(rs.messages_json);
      const currentPhase = rs.current_phase as Phase;
      const phaseStatuses = JSON.parse(rs.phase_statuses_json) as Record<Phase, PhaseStatus>;

      // Prefer run_state project info, fall back to session-derived
      const projectPath = rs.project_path || sessionRows[0]?.project_path || "";
      const projectName = rs.project_name || basename(projectPath);

      return NextResponse.json({
        runId,
        projectPath,
        projectName,
        currentPhase,
        phaseStatuses,
        messages,
      });
    }

    // Legacy fallback: derive state from sessions only
    const projectPath = sessionRows[0].project_path || "";
    const projectName = basename(projectPath);

    const lastSession = sessionRows[sessionRows.length - 1];
    const lastPhase = SESSION_TYPE_PHASE[lastSession.session_type] ?? 1;
    const lastDone = lastSession.status === "done" || lastSession.status === "completed";

    const currentPhase: Phase = lastDone ? (Math.min(lastPhase + 1, 7) as Phase) : (lastPhase as Phase);

    const phaseStatuses: Record<Phase, PhaseStatus> = {
      1: "locked",
      2: "locked",
      3: "locked",
      4: "locked",
      5: "locked",
      6: "locked",
      7: "locked",
    };

    for (let p = 1; p <= 7; p++) {
      const phase = p as Phase;
      if (phase < currentPhase) {
        phaseStatuses[phase] = "completed";
      } else if (phase === currentPhase) {
        phaseStatuses[phase] = "active";
      } else {
        phaseStatuses[phase] = "locked";
      }
    }

    return NextResponse.json({
      runId,
      projectPath,
      projectName,
      currentPhase,
      phaseStatuses,
      messages: [],
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to fetch run" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;

  if (!runId || typeof runId !== "string") {
    return NextResponse.json({ error: "runId is required" }, { status: 400 });
  }

  try {
    const conn = await getDb();
    await execute(conn, "DELETE FROM session_logs WHERE session_id IN (SELECT id FROM sessions WHERE run_id = ?)", [
      runId,
    ]);
    await execute(conn, "DELETE FROM sessions WHERE run_id = ?", [runId]);
    await execute(conn, "DELETE FROM run_state WHERE run_id = ?", [runId]);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to delete run" }, { status: 500 });
  }
}
