import { type NextRequest, NextResponse } from "next/server";
import { execute, getDb, queryAll } from "@/lib/db";
import { parseBody, voiceoverScriptsSchema } from "@/lib/validations";

export async function GET(request: NextRequest) {
  const runId = request.nextUrl.searchParams.get("runId");
  if (!runId) return NextResponse.json({ error: "runId is required" }, { status: 400 });

  try {
    const conn = await getDb();
    const rows = await queryAll<{
      flow_id: string;
      paragraphs_json: string;
    }>(conn, "SELECT flow_id, paragraphs_json FROM flow_voiceover WHERE run_id = ?", [runId]);

    // Return as Record<string, string[]> for backward compatibility
    const scripts: Record<string, string[]> = {};
    for (const row of rows) {
      scripts[row.flow_id] = JSON.parse(row.paragraphs_json);
    }

    return NextResponse.json(scripts);
  } catch (error) {
    console.error("Failed to fetch voiceover scripts:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const runId = request.nextUrl.searchParams.get("runId");
  if (!runId) return NextResponse.json({ error: "runId is required" }, { status: 400 });

  const parsed = await parseBody(request, voiceoverScriptsSchema);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }
  const scripts = parsed.data;

  try {
    const conn = await getDb();

    for (const [flowId, paragraphs] of Object.entries(scripts)) {
      // Check if a flow_voiceover row exists for this flow
      const existing = await queryAll<{ id: string; markers_json: string }>(
        conn,
        "SELECT id, markers_json FROM flow_voiceover WHERE run_id = ? AND flow_id = ?",
        [runId, flowId],
      );

      if (existing.length > 0) {
        // Update existing row, preserve markers
        await execute(conn, "UPDATE flow_voiceover SET paragraphs_json = ? WHERE id = ?", [
          JSON.stringify(paragraphs),
          existing[0].id,
        ]);
      } else {
        // Insert new row
        await execute(
          conn,
          "INSERT INTO flow_voiceover (id, run_id, flow_id, paragraphs_json, markers_json) VALUES (?, ?, ?, ?, '[]')",
          [crypto.randomUUID(), runId, flowId, JSON.stringify(paragraphs)],
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update voiceover scripts:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
