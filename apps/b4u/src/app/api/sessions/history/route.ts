import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { ensureDatabase } from "@/lib/db-init";

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

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

function basename(path: string): string {
  return path.split("/").filter(Boolean).pop() || path;
}

/** Split a project's sessions into runs where gaps > 2 hours start a new run. */
function splitIntoRuns(sessions: SessionRow[]): SessionRow[][] {
  if (sessions.length === 0) return [];

  // Sessions arrive sorted DESC — process in chronological order (ASC)
  const sorted = [...sessions].reverse();
  const runs: SessionRow[][] = [[sorted[0]]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const prevTime = prev.created_at ? new Date(prev.created_at).getTime() : 0;
    const currTime = curr.created_at ? new Date(curr.created_at).getTime() : 0;

    if (currTime - prevTime > TWO_HOURS_MS) {
      runs.push([curr]);
    } else {
      runs[runs.length - 1].push(curr);
    }
  }

  // Reverse so most recent run is first
  return runs.reverse();
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
    await ensureDatabase();

    const rows = await query<SessionRow>(
      `SELECT id, session_type, status, label, project_path, run_id,
              started_at, completed_at, created_at, error_message
       FROM sessions
       ORDER BY created_at DESC
       LIMIT 200`,
    );

    // Separate sessions with run_id from legacy sessions
    const withRunId: Record<string, SessionRow[]> = {};
    const legacyByProject: Record<string, SessionRow[]> = {};

    for (const row of rows) {
      if (row.run_id) {
        if (!withRunId[row.run_id]) withRunId[row.run_id] = [];
        withRunId[row.run_id].push(row);
      } else {
        const key = row.project_path || "Unknown";
        if (!legacyByProject[key]) legacyByProject[key] = [];
        legacyByProject[key].push(row);
      }
    }

    // Build flat run entries list
    const allRuns: RunEntry[] = [];

    for (const sessions of Object.values(withRunId)) {
      const sorted = [...sessions].sort(
        (a, b) => new Date(a.created_at ?? "").getTime() - new Date(b.created_at ?? "").getTime(),
      );
      const projectPath = sorted[0].project_path || "Unknown";
      allRuns.push(buildRunEntry(projectPath, sorted));
    }

    for (const [projectPath, sessions] of Object.entries(legacyByProject)) {
      const runs = splitIntoRuns(sessions);
      allRuns.push(...runs.map((runSessions) => buildRunEntry(projectPath, runSessions)));
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
