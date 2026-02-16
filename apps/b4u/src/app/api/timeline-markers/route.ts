import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET() {
  try {
    const rows = await query<{
      flow_id: string;
      timestamp: string;
      label: string;
      paragraph_index: number;
    }>("SELECT flow_id, timestamp, label, paragraph_index FROM timeline_markers ORDER BY flow_id, id");

    // Group by flow_id into Record<string, TimelineMarker[]>
    const markers: Record<string, { timestamp: string; label: string; paragraphIndex: number }[]> = {};
    for (const row of rows) {
      if (!markers[row.flow_id]) {
        markers[row.flow_id] = [];
      }
      markers[row.flow_id].push({
        timestamp: row.timestamp,
        label: row.label,
        paragraphIndex: row.paragraph_index,
      });
    }

    return NextResponse.json(markers);
  } catch (error) {
    console.error("Failed to fetch timeline markers:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
