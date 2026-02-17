import { type NextRequest, NextResponse } from "next/server";
import { execute, getDb, queryAll } from "@/lib/db";
import { flowScriptsArraySchema, parseBody } from "@/lib/validations";

export async function GET(request: NextRequest) {
  const runId = request.nextUrl.searchParams.get("runId");
  if (!runId) return NextResponse.json({ error: "runId is required" }, { status: 400 });

  try {
    const conn = await getDb();
    const flows = await queryAll<{
      flow_id: string;
      flow_name: string;
    }>(conn, "SELECT flow_id, flow_name FROM flow_scripts WHERE run_id = ? ORDER BY id", [runId]);

    const steps = await queryAll<{
      id: string;
      flow_id: string;
      step_number: number;
      url: string;
      action: string;
      expected_outcome: string;
      duration: string;
    }>(
      conn,
      "SELECT id, flow_id, step_number, url, action, expected_outcome, duration FROM script_steps WHERE run_id = ? ORDER BY flow_id, step_number",
      [runId],
    );

    const result = flows.map((f) => ({
      flowId: f.flow_id,
      flowName: f.flow_name,
      steps: steps
        .filter((s) => s.flow_id === f.flow_id)
        .map((s) => ({
          id: s.id,
          stepNumber: s.step_number,
          url: s.url,
          action: s.action,
          expectedOutcome: s.expected_outcome,
          duration: s.duration,
        })),
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to fetch flow scripts:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const runId = request.nextUrl.searchParams.get("runId");
  if (!runId) return NextResponse.json({ error: "runId is required" }, { status: 400 });

  const parsed = await parseBody(request, flowScriptsArraySchema);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }
  const flowScripts = parsed.data;

  try {
    const conn = await getDb();
    await execute(conn, "DELETE FROM script_steps WHERE run_id = ?", [runId]);

    for (const flow of flowScripts) {
      for (const step of flow.steps) {
        await execute(
          conn,
          "INSERT INTO script_steps (id, run_id, flow_id, step_number, url, action, expected_outcome, duration) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          [step.id, runId, flow.flowId, step.stepNumber, step.url, step.action, step.expectedOutcome, step.duration],
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update flow scripts:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
