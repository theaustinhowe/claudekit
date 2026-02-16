import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET() {
  try {
    const rows = await query<{
      name: string;
      framework: string;
      directories: string[];
      auth: string;
      database_info: string;
    }>("SELECT name, framework, directories, auth, database_info FROM project_summary WHERE id = 1");

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
