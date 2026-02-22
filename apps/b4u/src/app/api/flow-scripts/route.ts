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
      steps_json: string;
    }>(conn, "SELECT flow_id, flow_name, steps_json FROM flow_scripts WHERE run_id = ?", [runId]);

    const result = flows.map((f) => ({
      flowId: f.flow_id,
      flowName: f.flow_name,
      steps: JSON.parse(f.steps_json),
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
    await execute(conn, "DELETE FROM flow_scripts WHERE run_id = ?", [runId]);

    for (const flow of flowScripts) {
      await execute(
        conn,
        "INSERT INTO flow_scripts (id, run_id, flow_id, flow_name, steps_json) VALUES (?, ?, ?, ?, ?)",
        [crypto.randomUUID(), runId, flow.flowId, flow.flowName, JSON.stringify(flow.steps)],
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update flow scripts:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
