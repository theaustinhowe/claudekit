import { type NextRequest, NextResponse } from "next/server";
import { execute, getDb, queryOne } from "@/lib/db";
import { parseBody, userFlowsArraySchema } from "@/lib/validations";

export async function GET(request: NextRequest) {
  const runId = request.nextUrl.searchParams.get("runId");
  if (!runId) return NextResponse.json({ error: "runId is required" }, { status: 400 });

  try {
    const conn = await getDb();
    const row = await queryOne<{ data_json: string }>(
      conn,
      "SELECT data_json FROM run_content WHERE run_id = ? AND content_type = 'user_flows'",
      [runId],
    );

    if (!row) return NextResponse.json([]);

    const flows = JSON.parse(row.data_json);
    return NextResponse.json(flows);
  } catch (error) {
    console.error("Failed to fetch user flows:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const runId = request.nextUrl.searchParams.get("runId");
  if (!runId) return NextResponse.json({ error: "runId is required" }, { status: 400 });

  const parsed = await parseBody(request, userFlowsArraySchema);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }
  const flows = parsed.data;

  try {
    const conn = await getDb();
    await execute(conn, "DELETE FROM run_content WHERE run_id = ? AND content_type = 'user_flows'", [runId]);

    await execute(
      conn,
      "INSERT INTO run_content (id, run_id, content_type, data_json) VALUES (?, ?, 'user_flows', ?)",
      [crypto.randomUUID(), runId, JSON.stringify(flows)],
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update user flows:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
