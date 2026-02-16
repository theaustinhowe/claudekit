import { NextResponse } from "next/server";
import { getDb, queryAll } from "@/lib/db";

type SessionRow = Record<string, unknown> & {
  id: string;
  session_type: string;
  status: string;
  label: string | null;
  project_path: string | null;
  run_id: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string | null;
  error_message: string | null;
};

interface RunEntry {
  runId: string | null;
  projectPath: string;
  projectName: string;
  status: string;
  latestSessionType: string;
  sessionCount: number;
  startedAt: string | null;
  completedAt: string | null;
  hasError: boolean;
  errorMessage: string | null;
}

function basename(path: string): string {
  return path.split("/").filter(Boolean).pop() || path;
}

function buildRunEntry(projectPath: string, sessions: SessionRow[]): RunEntry {
  // Sessions within a run are in chronological order (earliest first)
  const first = sessions[0];
  const last = sessions[sessions.length - 1];

  const hasError = sessions.some((s) => s.status === "error" || s.status === "failed");
  const errorSession = sessions.find((s) => s.status === "error" || s.status === "failed");

  // Use the run_id from the first session that has one
  const runId = sessions.find((s) => s.run_id)?.run_id ?? null;

  return {
    runId,
    projectPath,
    projectName: basename(projectPath),
    status: last.status,
    latestSessionType: last.session_type,
    sessionCount: sessions.length,
    startedAt: first.created_at,
    completedAt: last.completed_at,
    hasError,
    errorMessage: errorSession?.error_message ?? null,
  };
}

export async function GET() {
  try {
    const conn = await getDb();

    const rows = await queryAll<SessionRow>(
      conn,
      `SELECT id, session_type, status, label, project_path, run_id,
              started_at, completed_at, created_at, error_message
       FROM sessions
       WHERE run_id IS NOT NULL
       ORDER BY created_at DESC
       LIMIT 200`,
    );

    // Group sessions by run_id
    const byRunId: Record<string, SessionRow[]> = {};
    for (const row of rows) {
      const runId = row.run_id ?? "";
      if (!byRunId[runId]) byRunId[runId] = [];
      byRunId[runId].push(row);
    }

    // Build flat run entries list
    const allRuns: RunEntry[] = [];

    for (const sessions of Object.values(byRunId)) {
      const sorted = [...sessions].sort(
        (a, b) => new Date(a.created_at ?? "").getTime() - new Date(b.created_at ?? "").getTime(),
      );
      const projectPath = sorted[0].project_path || "Unknown";
      allRuns.push(buildRunEntry(projectPath, sorted));
    }

    // Sort by most recent first
    allRuns.sort((a, b) => {
      const ta = a.startedAt ? new Date(a.startedAt).getTime() : 0;
      const tb = b.startedAt ? new Date(b.startedAt).getTime() : 0;
      return tb - ta;
    });

    return NextResponse.json({ runs: allRuns });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to fetch history",
      },
      { status: 500 },
    );
  }
}
