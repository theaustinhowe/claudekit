import { runClaude } from "@devkit/claude-runner";
import { NextResponse } from "next/server";
import { buildChatResponsePrompt } from "@/lib/claude/prompts/chat-response";
import { getDb, queryAll, queryOne } from "@/lib/db";
import type { Phase } from "@/lib/types";

async function loadPhaseContext(phase: Phase): Promise<Record<string, unknown>> {
  const conn = await getDb();
  switch (phase) {
    case 1: {
      const summary = await queryOne<Record<string, unknown>>(conn, "SELECT * FROM project_summary LIMIT 1");
      return { summary: summary || {} };
    }
    case 2: {
      const routes = await queryAll<Record<string, unknown>>(conn, "SELECT path, title FROM routes ORDER BY id");
      const flows = await queryAll<Record<string, unknown>>(conn, "SELECT name FROM user_flows ORDER BY id");
      return { routes, flows };
    }
    case 3: {
      const entities = await queryAll<Record<string, unknown>>(conn, "SELECT name, count FROM mock_data_entities");
      const auth = await queryAll<Record<string, unknown>>(conn, "SELECT label, enabled FROM auth_overrides");
      return { entities, authOverrides: auth };
    }
    case 4: {
      const scripts = await queryAll<Record<string, unknown>>(conn, "SELECT flow_name FROM flow_scripts");
      const steps = await queryAll<Record<string, unknown>>(conn, "SELECT COUNT(*) as total FROM script_steps");
      return { scripts, totalSteps: (steps[0] as { total: number })?.total ?? 0 };
    }
    case 5:
      return { status: "recording in progress" };
    case 6: {
      const voiceovers = await queryAll<Record<string, unknown>>(
        conn,
        "SELECT flow_id FROM voiceover_scripts GROUP BY flow_id",
      );
      return { voiceovers };
    }
    case 7:
      return { status: "final output ready" };
    default:
      return {};
  }
}

export async function POST(request: Request) {
  try {
    const { message, phase, runId: _runId } = await request.json();

    if (!message || !phase) {
      return NextResponse.json({ error: "message and phase are required" }, { status: 400 });
    }

    const phaseData = await loadPhaseContext(phase as Phase);
    const prompt = buildChatResponsePrompt(message, phase as Phase, phaseData);

    // Get project path for cwd
    const conn = await getDb();
    const summaryRow = await queryOne<{ project_path: string }>(
      conn,
      "SELECT project_path FROM project_summary LIMIT 1",
    );
    const cwd = summaryRow?.project_path || process.cwd();

    const result = await runClaude({
      cwd,
      prompt,
      allowedTools: "",
      disallowedTools: "Write,Edit,Bash,Read,Glob,Grep,LS",
      onProgress: () => {},
    });

    // Parse the JSON response
    let parsed: { response: string; suggestedAction?: string | null };
    try {
      const jsonMatch = result.stdout.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found");
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      // If parsing fails, use the raw output as the response
      parsed = { response: result.stdout.trim().slice(0, 500), suggestedAction: null };
    }

    return NextResponse.json(parsed);
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { response: "I encountered an issue processing your message. Please try again.", suggestedAction: null },
      { status: 200 },
    );
  }
}
