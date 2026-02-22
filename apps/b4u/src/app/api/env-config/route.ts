import { type NextRequest, NextResponse } from "next/server";
import { execute, getDb, queryOne } from "@/lib/db";
import { parseBody, togglePatchSchema } from "@/lib/validations";

export async function GET(request: NextRequest) {
  const runId = request.nextUrl.searchParams.get("runId");
  if (!runId) return NextResponse.json({ error: "runId is required" }, { status: 400 });

  try {
    const conn = await getDb();
    const row = await queryOne<{ data_json: string }>(
      conn,
      "SELECT data_json FROM run_content WHERE run_id = ? AND content_type = 'env_items'",
      [runId],
    );

    if (!row) return NextResponse.json([]);

    const items = JSON.parse(row.data_json);
    return NextResponse.json(items);
  } catch (error) {
    console.error("Failed to fetch environment config:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const parsed = await parseBody(request, togglePatchSchema);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }
  const { id, enabled, runId } = parsed.data;

  try {
    const conn = await getDb();
    const row = await queryOne<{ id: string; data_json: string }>(
      conn,
      "SELECT id, data_json FROM run_content WHERE run_id = ? AND content_type = 'env_items'",
      [runId],
    );

    if (!row) {
      return NextResponse.json({ error: "Env items not found" }, { status: 404 });
    }

    const items = JSON.parse(row.data_json) as Array<{ id: string; label: string; enabled: boolean }>;
    const updated = items.map((item) => (item.id === id ? { ...item, enabled } : item));

    await execute(conn, "UPDATE run_content SET data_json = ? WHERE id = ?", [JSON.stringify(updated), row.id]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update env config:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
