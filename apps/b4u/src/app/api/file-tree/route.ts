import { type NextRequest, NextResponse } from "next/server";
import { execute, getDb, queryOne } from "@/lib/db";

export async function GET(request: NextRequest) {
  const runId = request.nextUrl.searchParams.get("runId");
  if (!runId) return NextResponse.json({ error: "runId is required" }, { status: 400 });

  try {
    const conn = await getDb();
    const row = await queryOne<{ data_json: string }>(
      conn,
      "SELECT data_json FROM run_content WHERE run_id = ? AND content_type = 'file_tree'",
      [runId],
    );

    if (!row) {
      return NextResponse.json({ error: "File tree not found" }, { status: 404 });
    }

    const tree = JSON.parse(row.data_json);
    return NextResponse.json(tree);
  } catch (error) {
    console.error("Failed to fetch file tree:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const runId = request.nextUrl.searchParams.get("runId");
  if (!runId) return NextResponse.json({ error: "runId is required" }, { status: 400 });

  try {
    const { tree, name } = await request.json();
    if (!tree) return NextResponse.json({ error: "tree required" }, { status: 400 });
    const treeData = { name: name || "root", type: "directory", children: tree };
    const conn = await getDb();
    await execute(conn, "DELETE FROM run_content WHERE run_id = ? AND content_type = 'file_tree'", [runId]);
    await execute(
      conn,
      "INSERT INTO run_content (id, run_id, content_type, data_json) VALUES (?, ?, 'file_tree', ?)",
      [crypto.randomUUID(), runId, JSON.stringify(treeData)],
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to save file tree:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
