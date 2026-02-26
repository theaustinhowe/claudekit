import { NextResponse } from "next/server";
import { execute, getDb, queryAll } from "@/lib/db";
import type { ChatMessage, Phase, PhaseStatus, PhaseThread } from "@/lib/types";

type SessionRow = {
  id: string;
  session_type: string;
  status: string;
  context_name: string | null;
  created_at: string | null;
};

type RunStateRow = {
  messages_json: string;
  current_phase: number;
  phase_statuses_json: string;
  project_path: string | null;
  project_name: string | null;
  threads_json: string | null;
};

type ThreadRow = {
  id: string;
  run_id: string;
  phase: number;
  revision: number;
  messages_json: string;
  decisions_json: string;
  status: string;
  created_at: string;
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

function basename(path: string): string {
  return path.split("/").filter(Boolean).pop() || path;
}

function emptyThreads(): Record<Phase, PhaseThread[]> {
  return { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] };
}

function emptyActiveThreadIds(): Record<Phase, string | null> {
  return { 1: null, 2: null, 3: null, 4: null, 5: null, 6: null, 7: null };
}

/**
 * Convert legacy flat messages into a synthetic single-thread structure.
 * Used for backward compat with runs that predate per-phase threading.
 */
function convertLegacyMessages(
  runId: string,
  messages: ChatMessage[],
  currentPhase: Phase,
  phaseStatuses: Record<Phase, PhaseStatus>,
): { threads: Record<Phase, PhaseThread[]>; activeThreadIds: Record<Phase, string | null> } {
  const threads = emptyThreads();
  const activeThreadIds = emptyActiveThreadIds();

  // Put all messages into a single thread on the current phase
  const threadId = `legacy-${runId}`;
  const thread: PhaseThread = {
    id: threadId,
    runId,
    phase: currentPhase,
    revision: 1,
    messages,
    decisions: [],
    status: phaseStatuses[currentPhase] === "completed" ? "completed" : "active",
    createdAt: messages[0]?.timestamp ?? Date.now(),
  };

  threads[currentPhase] = [thread];
  activeThreadIds[currentPhase] = threadId;

  return { threads, activeThreadIds };
}

export async function GET(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;

  if (!runId || typeof runId !== "string") {
    return NextResponse.json({ error: "runId is required" }, { status: 400 });
  }

  try {
    const conn = await getDb();

    // Query run_state, phase_threads, and sessions
    const stateRows = await queryAll<RunStateRow>(
      conn,
      `SELECT messages_json, current_phase, phase_statuses_json, project_path, project_name, threads_json
       FROM run_state
       WHERE run_id = ?`,
      [runId],
    );

    const threadRows = await queryAll<ThreadRow>(
      conn,
      `SELECT id, run_id, phase, revision, messages_json, decisions_json, status, created_at
       FROM phase_threads
       WHERE run_id = ?
       ORDER BY phase ASC, revision ASC`,
      [runId],
    );

    const sessionRows = await queryAll<SessionRow>(
      conn,
      `SELECT id, session_type, status, context_name, created_at
       FROM sessions
       WHERE context_id = ?
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
      const currentPhase = rs.current_phase as Phase;
      const phaseStatuses = JSON.parse(rs.phase_statuses_json) as Record<Phase, PhaseStatus>;
      const projectPath = rs.project_path || sessionRows[0]?.context_name || "";
      const projectName = rs.project_name || basename(projectPath);

      let threads: Record<Phase, PhaseThread[]>;
      let activeThreadIds: Record<Phase, string | null>;

      if (threadRows.length > 0) {
        // Reconstruct threads from phase_threads table
        threads = emptyThreads();
        for (const row of threadRows) {
          const phase = row.phase as Phase;
          threads[phase].push({
            id: row.id,
            runId: row.run_id,
            phase,
            revision: row.revision,
            messages: JSON.parse(row.messages_json),
            decisions: JSON.parse(row.decisions_json),
            status: row.status as PhaseThread["status"],
            createdAt: new Date(row.created_at).getTime(),
          });
        }

        // Restore activeThreadIds from run_state threads_json
        if (rs.threads_json) {
          try {
            activeThreadIds = JSON.parse(rs.threads_json) as Record<Phase, string | null>;
          } catch {
            activeThreadIds = emptyActiveThreadIds();
          }
        } else {
          activeThreadIds = emptyActiveThreadIds();
        }

        // Fallback: if an activeThreadId is null but threads exist, pick the latest active/completed
        for (let p = 1; p <= 7; p++) {
          const phase = p as Phase;
          if (!activeThreadIds[phase] && threads[phase].length > 0) {
            const active = threads[phase].find((t) => t.status === "active");
            activeThreadIds[phase] = active?.id ?? threads[phase][threads[phase].length - 1].id;
          }
        }
      } else {
        // Legacy: convert flat messages to synthetic thread
        const messages = JSON.parse(rs.messages_json) as ChatMessage[];
        const converted = convertLegacyMessages(runId, messages, currentPhase, phaseStatuses);
        threads = converted.threads;
        activeThreadIds = converted.activeThreadIds;
      }

      return NextResponse.json({
        runId,
        projectPath,
        projectName,
        currentPhase,
        phaseStatuses,
        threads,
        activeThreadIds,
      });
    }

    // Legacy fallback: derive state from sessions only
    const projectPath = sessionRows[0].context_name || "";
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

    const messages: ChatMessage[] = [
      {
        id: `restored-${runId}`,
        role: "system",
        content: `Restored run for ${projectName}. Chat history is unavailable for this run.`,
        timestamp: Date.now(),
      },
    ];

    const converted = convertLegacyMessages(runId, messages, currentPhase, phaseStatuses);

    // Backfill run_state so future restorations find persisted state
    try {
      await execute(
        conn,
        `INSERT INTO run_state (run_id, messages_json, current_phase, phase_statuses_json, project_path, project_name, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, now())
         ON CONFLICT (run_id) DO NOTHING`,
        [runId, JSON.stringify(messages), currentPhase, JSON.stringify(phaseStatuses), projectPath, projectName],
      );
    } catch {
      /* non-critical — best-effort backfill */
    }

    return NextResponse.json({
      runId,
      projectPath,
      projectName,
      currentPhase,
      phaseStatuses,
      threads: converted.threads,
      activeThreadIds: converted.activeThreadIds,
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

    // Clean up content tables scoped by run_id
    const contentTables = [
      "project_summary",
      "run_content",
      "flow_scripts",
      "flow_voiceover",
      "chapter_markers",
      "recordings",
      "audio_files",
      "final_videos",
      "phase_threads",
    ];
    for (const table of contentTables) {
      await execute(conn, `DELETE FROM ${table} WHERE run_id = ?`, [runId]);
    }

    // Clean up session data
    await execute(conn, "DELETE FROM session_logs WHERE session_id IN (SELECT id FROM sessions WHERE context_id = ?)", [
      runId,
    ]);
    await execute(conn, "DELETE FROM sessions WHERE context_id = ?", [runId]);
    await execute(conn, "DELETE FROM run_state WHERE run_id = ?", [runId]);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to delete run" }, { status: 500 });
  }
}
