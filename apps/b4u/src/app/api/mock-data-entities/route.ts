import { type NextRequest, NextResponse } from "next/server";
import { getDb, queryAll } from "@/lib/db";

export async function GET(request: NextRequest) {
  const runId = request.nextUrl.searchParams.get("runId");
  if (!runId) return NextResponse.json({ error: "runId is required" }, { status: 400 });

  try {
    const conn = await getDb();
    const rows = await queryAll<{
      name: string;
      count: number;
      note: string;
    }>(conn, "SELECT name, count, note FROM mock_data_entities WHERE run_id = ? ORDER BY id", [runId]);

    return NextResponse.json(rows);
  } catch (error) {
    console.error("Failed to fetch mock data entities:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
