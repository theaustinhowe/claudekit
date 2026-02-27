import { NextResponse } from "next/server";
import { getDb, queryAll } from "@/lib/db";
import type { Phase } from "@/lib/types";

type CountRow = { cnt: number };

/**
 * Lightweight prerequisite checker — verifies that the required output
 * from previous phases exists before allowing advancement.
 *
 * GET /api/runs/[runId]/validate-phase?phase=3
 */
export async function GET(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const url = new URL(request.url);
  const phaseParam = url.searchParams.get("phase");

  if (!runId) {
    return NextResponse.json({ error: "runId is required" }, { status: 400 });
  }
  if (!phaseParam) {
    return NextResponse.json({ error: "phase query param is required" }, { status: 400 });
  }

  const phase = Number(phaseParam) as Phase;
  if (phase < 2 || phase > 7) {
    return NextResponse.json({ valid: true });
  }

  try {
    const conn = await getDb();

    switch (phase) {
      // Phase 2 requires project_summary from Phase 1
      case 2: {
        const rows = await queryAll<CountRow>(
          conn,
          "SELECT count(*)::INTEGER AS cnt FROM project_summary WHERE run_id = ?",
          [runId],
        );
        if ((rows[0]?.cnt ?? 0) === 0) {
          return NextResponse.json({
            valid: false,
            message: "Project scan not found. Complete Phase 1 first.",
          });
        }
        break;
      }

      // Phase 3 requires routes and user_flows from Phase 2
      case 3: {
        const rows = await queryAll<CountRow>(
          conn,
          "SELECT count(*)::INTEGER AS cnt FROM run_content WHERE run_id = ? AND content_type IN ('routes', 'user_flows')",
          [runId],
        );
        if ((rows[0]?.cnt ?? 0) < 2) {
          return NextResponse.json({
            valid: false,
            message: "App outline (routes/flows) not found. Complete Phase 2 first.",
          });
        }
        break;
      }

      // Phase 4 requires mock_data_entities from Phase 3
      case 4: {
        const rows = await queryAll<CountRow>(
          conn,
          "SELECT count(*)::INTEGER AS cnt FROM run_content WHERE run_id = ? AND content_type = 'mock_data_entities'",
          [runId],
        );
        if ((rows[0]?.cnt ?? 0) === 0) {
          return NextResponse.json({
            valid: false,
            message: "Data plan not found. Complete Phase 3 first.",
          });
        }
        break;
      }

      // Phase 5 requires flow_scripts from Phase 4
      case 5: {
        const rows = await queryAll<CountRow>(
          conn,
          "SELECT count(*)::INTEGER AS cnt FROM flow_scripts WHERE run_id = ?",
          [runId],
        );
        if ((rows[0]?.cnt ?? 0) === 0) {
          return NextResponse.json({
            valid: false,
            message: "Demo scripts not found. Complete Phase 4 first.",
          });
        }
        break;
      }

      // Phase 6 requires completed recordings from Phase 5
      case 6: {
        const rows = await queryAll<CountRow>(
          conn,
          "SELECT count(*)::INTEGER AS cnt FROM recordings WHERE run_id = ? AND status = 'done'",
          [runId],
        );
        if ((rows[0]?.cnt ?? 0) === 0) {
          return NextResponse.json({
            valid: false,
            message: "No completed recordings found. Complete Phase 5 first.",
          });
        }
        break;
      }

      // Phase 7 requires flow_voiceover from Phase 6
      case 7: {
        const rows = await queryAll<CountRow>(
          conn,
          "SELECT count(*)::INTEGER AS cnt FROM flow_voiceover WHERE run_id = ?",
          [runId],
        );
        if ((rows[0]?.cnt ?? 0) === 0) {
          return NextResponse.json({
            valid: false,
            message: "Voiceover scripts not found. Complete Phase 6 first.",
          });
        }
        break;
      }
    }

    return NextResponse.json({ valid: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Validation failed" }, { status: 500 });
  }
}
