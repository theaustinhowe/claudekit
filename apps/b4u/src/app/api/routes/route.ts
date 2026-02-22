import { type NextRequest, NextResponse } from "next/server";
import { execute, getDb, queryOne } from "@/lib/db";
import { parseBody, routesArraySchema } from "@/lib/validations";

export async function GET(request: NextRequest) {
  const runId = request.nextUrl.searchParams.get("runId");
  if (!runId) return NextResponse.json({ error: "runId is required" }, { status: 400 });

  try {
    const conn = await getDb();
    const row = await queryOne<{ data_json: string }>(
      conn,
      "SELECT data_json FROM run_content WHERE run_id = ? AND content_type = 'routes'",
      [runId],
    );

    if (!row) return NextResponse.json([]);

    const routes = JSON.parse(row.data_json);
    return NextResponse.json(routes);
  } catch (error) {
    console.error("Failed to fetch routes:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const runId = request.nextUrl.searchParams.get("runId");
  if (!runId) return NextResponse.json({ error: "runId is required" }, { status: 400 });

  const parsed = await parseBody(request, routesArraySchema);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }
  const routes = parsed.data;

  try {
    const conn = await getDb();
    await execute(conn, "DELETE FROM run_content WHERE run_id = ? AND content_type = 'routes'", [runId]);

    await execute(
      conn,
      "INSERT INTO run_content (id, run_id, content_type, data_json) VALUES (?, ?, 'routes', ?)",
      [crypto.randomUUID(), runId, JSON.stringify(routes)],
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update routes:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
