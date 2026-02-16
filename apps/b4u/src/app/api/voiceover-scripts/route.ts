import { type NextRequest, NextResponse } from "next/server";
import { execute, executePrepared, query } from "@/lib/db";
import { parseBody, voiceoverScriptsSchema } from "@/lib/validations";

export async function GET() {
  try {
    const rows = await query<{
      flow_id: string;
      paragraph_index: number;
      text: string;
    }>("SELECT flow_id, paragraph_index, text FROM voiceover_scripts ORDER BY flow_id, paragraph_index");

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
  const parsed = await parseBody(request, voiceoverScriptsSchema);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }
  const scripts = parsed.data;

  try {
    await execute("DELETE FROM voiceover_scripts");

    for (const [flowId, paragraphs] of Object.entries(scripts)) {
      for (let i = 0; i < paragraphs.length; i++) {
        await executePrepared(
          "INSERT INTO voiceover_scripts (flow_id, paragraph_index, text) VALUES ($flowId, $idx, $text)",
          { $flowId: flowId, $idx: i, $text: paragraphs[i] },
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update voiceover scripts:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
