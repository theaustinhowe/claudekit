import { NextResponse } from "next/server";
import { execute, getDb, queryAll } from "@/lib/db";

export async function GET() {
  try {
    const conn = await getDb();
    const rows = await queryAll<{ tree_json: string }>(conn, "SELECT tree_json FROM file_tree WHERE id = 1");

    if (rows.length === 0) {
      return NextResponse.json({ error: "File tree not found" }, { status: 404 });
    }

    let tree: unknown;
    try {
      tree = JSON.parse(rows[0].tree_json);
    } catch {
      console.error("Invalid JSON in file tree data");
      return NextResponse.json({ error: "Corrupt file tree data" }, { status: 500 });
    }
    return NextResponse.json(tree);
  } catch (error) {
    console.error("Failed to fetch file tree:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { tree, name } = await request.json();
    if (!tree) return NextResponse.json({ error: "tree required" }, { status: 400 });
    const treeJson = JSON.stringify({ name: name || "root", type: "directory", children: tree });
    const conn = await getDb();
    await execute(conn, "DELETE FROM file_tree");
    await execute(conn, "INSERT INTO file_tree (id, tree_json) VALUES (1, ?)", [treeJson]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to save file tree:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
