import { type NextRequest, NextResponse } from "next/server";
import { getDb, queryOne } from "@/lib/db";

export async function GET(request: NextRequest) {
  const runId = request.nextUrl.searchParams.get("runId");
  if (!runId) return NextResponse.json({ error: "runId is required" }, { status: 400 });

  try {
    const conn = await getDb();
    const row = await queryOne<{ data_json: string }>(
      conn,
      "SELECT data_json FROM run_content WHERE run_id = ? AND content_type = 'mock_data_entities'",
      [runId],
    );

    if (!row) return NextResponse.json([]);

    const entities = JSON.parse(row.data_json);
    return NextResponse.json(entities);
  } catch (error) {
    console.error("Failed to fetch mock data entities:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
