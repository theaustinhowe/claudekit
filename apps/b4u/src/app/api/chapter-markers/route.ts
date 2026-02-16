import { NextResponse } from "next/server";
import { getDb, queryAll } from "@/lib/db";

export async function GET() {
  try {
    const conn = await getDb();
    const rows = await queryAll<{
      flow_name: string;
      start_time: string;
    }>(conn, "SELECT flow_name, start_time FROM chapter_markers ORDER BY id");

    const markers = rows.map((r) => ({
      flowName: r.flow_name,
      startTime: r.start_time,
    }));

    return NextResponse.json(markers);
  } catch (error) {
    console.error("Failed to fetch chapter markers:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
