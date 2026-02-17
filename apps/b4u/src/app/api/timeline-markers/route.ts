import { type NextRequest, NextResponse } from "next/server";
import { execute, getDb, queryAll } from "@/lib/db";

export async function GET(request: NextRequest) {
  const runId = request.nextUrl.searchParams.get("runId");
  if (!runId) return NextResponse.json({ error: "runId is required" }, { status: 400 });

  try {
    const conn = await getDb();
    const rows = await queryAll<{
      flow_id: string;
      timestamp: string;
      label: string;
      paragraph_index: number;
    }>(
      conn,
      "SELECT flow_id, timestamp, label, paragraph_index FROM timeline_markers WHERE run_id = ? ORDER BY flow_id, id",
      [runId],
    );

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

export async function PUT(request: NextRequest) {
  const runId = request.nextUrl.searchParams.get("runId");
  if (!runId) return NextResponse.json({ error: "runId is required" }, { status: 400 });

  try {
    const body: Record<string, { timestamp: string; label: string; paragraphIndex: number }[]> = await request.json();
    const conn = await getDb();

    for (const [flowId, markers] of Object.entries(body)) {
      // Delete existing markers for this flow and run
      await execute(conn, "DELETE FROM timeline_markers WHERE flow_id = ? AND run_id = ?", [flowId, runId]);

      // Insert updated markers
      for (const marker of markers) {
        await execute(
          conn,
          "INSERT INTO timeline_markers (run_id, flow_id, timestamp, label, paragraph_index) VALUES (?, ?, ?, ?, ?)",
          [runId, flowId, marker.timestamp, marker.label, marker.paragraphIndex],
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to save timeline markers:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
