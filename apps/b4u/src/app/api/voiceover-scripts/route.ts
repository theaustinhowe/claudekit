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
      paragraph_index: number;
      text: string;
    }>(
      conn,
      "SELECT flow_id, paragraph_index, text FROM voiceover_scripts WHERE run_id = ? ORDER BY flow_id, paragraph_index",
      [runId],
    );

    // Group by flow_id into Record<string, string[]>
    const scripts: Record<string, string[]> = {};
    for (const row of rows) {
      if (!scripts[row.flow_id]) {
        scripts[row.flow_id] = [];
      }
      scripts[row.flow_id][row.paragraph_index] = row.text;
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
    await execute(conn, "DELETE FROM voiceover_scripts WHERE run_id = ?", [runId]);

    for (const [flowId, paragraphs] of Object.entries(scripts)) {
      for (let i = 0; i < paragraphs.length; i++) {
        await execute(
          conn,
          "INSERT INTO voiceover_scripts (run_id, flow_id, paragraph_index, text) VALUES (?, ?, ?, ?)",
          [runId, flowId, i, paragraphs[i]],
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update voiceover scripts:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
