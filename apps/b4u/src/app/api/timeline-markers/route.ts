import { type NextRequest, NextResponse } from "next/server";
import { execute, getDb, queryAll } from "@/lib/db";

export async function GET(request: NextRequest) {
  const runId = request.nextUrl.searchParams.get("runId");
  if (!runId) return NextResponse.json({ error: "runId is required" }, { status: 400 });

  try {
    const conn = await getDb();
    const rows = await queryAll<{
      flow_id: string;
      markers_json: string;
    }>(conn, "SELECT flow_id, markers_json FROM flow_voiceover WHERE run_id = ?", [runId]);

    // Return as Record<string, TimelineMarker[]> for backward compatibility
    const markers: Record<string, { timestamp: string; label: string; paragraphIndex: number }[]> = {};
    for (const row of rows) {
      markers[row.flow_id] = JSON.parse(row.markers_json);
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
      // Check if a flow_voiceover row exists for this flow
      const existing = await queryAll<{ id: string; paragraphs_json: string }>(
        conn,
        "SELECT id, paragraphs_json FROM flow_voiceover WHERE run_id = ? AND flow_id = ?",
        [runId, flowId],
      );

      if (existing.length > 0) {
        // Update existing row, preserve paragraphs
        await execute(conn, "UPDATE flow_voiceover SET markers_json = ? WHERE id = ?", [
          JSON.stringify(markers),
          existing[0].id,
        ]);
      } else {
        // Insert new row with empty paragraphs
        await execute(
          conn,
          "INSERT INTO flow_voiceover (id, run_id, flow_id, paragraphs_json, markers_json) VALUES (?, ?, ?, '[]', ?)",
          [crypto.randomUUID(), runId, flowId, JSON.stringify(markers)],
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to save timeline markers:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
