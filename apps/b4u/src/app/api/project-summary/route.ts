import { type NextRequest, NextResponse } from "next/server";
import { getDb, queryAll } from "@/lib/db";

export async function GET(request: NextRequest) {
  const runId = request.nextUrl.searchParams.get("runId");
  if (!runId) return NextResponse.json({ error: "runId is required" }, { status: 400 });

  try {
    const conn = await getDb();
    const rows = await queryAll<{
      name: string;
      framework: string;
      directories: string[];
      auth: string;
      database_info: string;
    }>(conn, "SELECT name, framework, directories, auth, database_info FROM project_summary WHERE run_id = ?", [runId]);

    if (rows.length === 0) {
      return NextResponse.json({ error: "Project summary not found" }, { status: 404 });
    }

    const row = rows[0];
    return NextResponse.json({
      name: row.name,
      framework: row.framework,
      directories: row.directories,
      auth: row.auth,
      database: row.database_info,
    });
  } catch (error) {
    console.error("Failed to fetch project summary:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
