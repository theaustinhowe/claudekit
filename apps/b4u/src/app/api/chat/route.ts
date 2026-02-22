import { runClaude } from "@claudekit/claude-runner";
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
      const routesRow = await queryOne<{ data_json: string }>(
        conn,
        "SELECT data_json FROM run_content WHERE content_type = 'routes' LIMIT 1",
      );
      const routes = routesRow ? JSON.parse(routesRow.data_json) : [];

      const flowsRow = await queryOne<{ data_json: string }>(
        conn,
        "SELECT data_json FROM run_content WHERE content_type = 'user_flows' LIMIT 1",
      );
      const flows = flowsRow ? JSON.parse(flowsRow.data_json) : [];

      return { routes, flows };
    }
    case 3: {
      const entitiesRow = await queryOne<{ data_json: string }>(
        conn,
        "SELECT data_json FROM run_content WHERE content_type = 'mock_data_entities' LIMIT 1",
      );
      const entities = entitiesRow ? JSON.parse(entitiesRow.data_json) : [];

      const authRow = await queryOne<{ data_json: string }>(
        conn,
        "SELECT data_json FROM run_content WHERE content_type = 'auth_overrides' LIMIT 1",
      );
      const authOverrides = authRow ? JSON.parse(authRow.data_json) : [];

      return { entities, authOverrides };
    }
    case 4: {
      const scripts = await queryAll<Record<string, unknown>>(conn, "SELECT flow_name FROM flow_scripts");
      const scriptRows = await queryAll<{ steps_json: string }>(conn, "SELECT steps_json FROM flow_scripts");
      const totalSteps = scriptRows.reduce((acc, row) => acc + JSON.parse(row.steps_json).length, 0);
      return { scripts, totalSteps };
    }
    case 5:
      return { status: "recording in progress" };
    case 6: {
      const voiceovers = await queryAll<Record<string, unknown>>(
        conn,
        "SELECT flow_id FROM flow_voiceover",
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
