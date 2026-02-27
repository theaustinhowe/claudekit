import { runClaude } from "@claudekit/claude-runner";
import { NextResponse } from "next/server";
import { extractJsonObject } from "@/lib/claude/extract-json";
import { buildChatResponsePrompt } from "@/lib/claude/prompts/chat-response";
import { getDb, queryAll, queryOne } from "@/lib/db";
import type { Phase } from "@/lib/types";

async function loadPhaseContext(phase: Phase, runId?: string): Promise<Record<string, unknown>> {
  const conn = await getDb();
  switch (phase) {
    case 1: {
      const summary = runId
        ? await queryOne<Record<string, unknown>>(conn, "SELECT * FROM project_summary WHERE run_id = ?", [runId])
        : await queryOne<Record<string, unknown>>(conn, "SELECT * FROM project_summary LIMIT 1");
      return { summary: summary || {} };
    }
    case 2: {
      const routesRow = runId
        ? await queryOne<{ data_json: string }>(
            conn,
            "SELECT data_json FROM run_content WHERE run_id = ? AND content_type = 'routes'",
            [runId],
          )
        : await queryOne<{ data_json: string }>(
            conn,
            "SELECT data_json FROM run_content WHERE content_type = 'routes' LIMIT 1",
          );
      const routes = routesRow ? JSON.parse(routesRow.data_json) : [];

      const flowsRow = runId
        ? await queryOne<{ data_json: string }>(
            conn,
            "SELECT data_json FROM run_content WHERE run_id = ? AND content_type = 'user_flows'",
            [runId],
          )
        : await queryOne<{ data_json: string }>(
            conn,
            "SELECT data_json FROM run_content WHERE content_type = 'user_flows' LIMIT 1",
          );
      const flows = flowsRow ? JSON.parse(flowsRow.data_json) : [];

      return { routes, flows };
    }
    case 3: {
      const entitiesRow = runId
        ? await queryOne<{ data_json: string }>(
            conn,
            "SELECT data_json FROM run_content WHERE run_id = ? AND content_type = 'mock_data_entities'",
            [runId],
          )
        : await queryOne<{ data_json: string }>(
            conn,
            "SELECT data_json FROM run_content WHERE content_type = 'mock_data_entities' LIMIT 1",
          );
      const entities = entitiesRow ? JSON.parse(entitiesRow.data_json) : [];

      const authRow = runId
        ? await queryOne<{ data_json: string }>(
            conn,
            "SELECT data_json FROM run_content WHERE run_id = ? AND content_type = 'auth_overrides'",
            [runId],
          )
        : await queryOne<{ data_json: string }>(
            conn,
            "SELECT data_json FROM run_content WHERE content_type = 'auth_overrides' LIMIT 1",
          );
      const authOverrides = authRow ? JSON.parse(authRow.data_json) : [];

      return { entities, authOverrides };
    }
    case 4: {
      const whereClause = runId ? "WHERE run_id = ?" : "";
      const params = runId ? [runId] : [];
      const scripts = await queryAll<Record<string, unknown>>(
        conn,
        `SELECT flow_name FROM flow_scripts ${whereClause}`,
        params,
      );
      const scriptRows = await queryAll<{ steps_json: string }>(
        conn,
        `SELECT steps_json FROM flow_scripts ${whereClause}`,
        params,
      );
      const totalSteps = scriptRows.reduce((acc, row) => acc + JSON.parse(row.steps_json).length, 0);
      return { scripts, totalSteps };
    }
    case 5:
      return { status: "recording in progress" };
    case 6: {
      const whereClause = runId ? "WHERE run_id = ?" : "";
      const params = runId ? [runId] : [];
      const voiceovers = await queryAll<Record<string, unknown>>(
        conn,
        `SELECT flow_id FROM flow_voiceover ${whereClause}`,
        params,
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
    const { message, phase, runId } = await request.json();

    if (!message || !phase) {
      return NextResponse.json({ error: "message and phase are required" }, { status: 400 });
    }

    if (phase > 1 && !runId) {
      return NextResponse.json({ error: "runId is required for phases after 1" }, { status: 400 });
    }

    const phaseData = await loadPhaseContext(phase as Phase, runId);
    const prompt = buildChatResponsePrompt(message, phase as Phase, phaseData);

    // Get project path for cwd
    const conn = await getDb();
    const summaryRow = runId
      ? await queryOne<{ project_path: string }>(conn, "SELECT project_path FROM project_summary WHERE run_id = ?", [
          runId,
        ])
      : await queryOne<{ project_path: string }>(conn, "SELECT project_path FROM project_summary LIMIT 1");
    const cwd = summaryRow?.project_path || process.cwd();

    const result = await runClaude({
      cwd,
      prompt,
      allowedTools: "",
      disallowedTools: "Write,Edit,Bash,Read,Glob,Grep,LS",
      onProgress: () => {},
    });

    // Parse the JSON response using balanced extraction
    let parsed: { response: string; suggestedAction?: string | null };
    try {
      const jsonStr = extractJsonObject(result.stdout);
      if (!jsonStr) throw new Error("No JSON found");
      parsed = JSON.parse(jsonStr);
    } catch {
      // If parsing fails, return 422 with the raw output as context
      return NextResponse.json(
        { error: "Failed to parse AI response", response: result.stdout.trim().slice(0, 500), suggestedAction: null },
        { status: 422 },
      );
    }

    return NextResponse.json(parsed);
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        response: "I encountered an issue processing your message. Please try again.",
        suggestedAction: null,
      },
      { status: 500 },
    );
  }
}
