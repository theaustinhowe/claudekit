import { runClaude } from "@claudekit/claude-runner";
import type { SessionRunner } from "@claudekit/session";
import { extractJsonObject } from "@/lib/claude/extract-json";
import { buildGenerateDataPlanPrompt } from "@/lib/claude/prompts/generate-data-plan";
import { execute, getDb, queryAll, queryOne } from "@/lib/db";

export function createGenerateDataPlanRunner(runId: string): SessionRunner {
  return async ({ onProgress, signal }) => {
    onProgress({ type: "progress", message: "Loading project context...", progress: 10 });

    const conn = await getDb();

    // Read project context from DB
    const summaryRows = await queryAll<{
      name: string;
      framework: string;
      auth: string;
      database_info: string;
      project_path: string;
    }>(
      conn,
      "SELECT name, framework, auth, database_info, project_path FROM project_summary WHERE run_id = ? LIMIT 1",
      [runId],
    );

    if (summaryRows.length === 0) {
      throw new Error("No project summary found. Run analyze-project first.");
    }

    const summary = summaryRows[0];

    // Read routes from run_content
    const routesRow = await queryOne<{ data_json: string }>(
      conn,
      "SELECT data_json FROM run_content WHERE run_id = ? AND content_type = 'routes'",
      [runId],
    );

    const routeData: Array<{ path: string; title: string }> = routesRow ? JSON.parse(routesRow.data_json) : [];

    // Read user flows from run_content
    const flowsRow = await queryOne<{ data_json: string }>(
      conn,
      "SELECT data_json FROM run_content WHERE run_id = ? AND content_type = 'user_flows'",
      [runId],
    );

    const flowData: Array<{ id: string; name: string; steps: string[] }> = flowsRow
      ? JSON.parse(flowsRow.data_json)
      : [];

    if (flowData.length === 0) {
      throw new Error("No user flows found. Run generate-outline first.");
    }

    const projectContext = {
      name: summary.name,
      framework: summary.framework,
      auth: summary.auth,
      database: summary.database_info,
      routes: routeData.map((r) => ({ path: r.path, title: r.title })),
      flows: flowData.map((f) => ({ id: f.id, name: f.name, steps: f.steps })),
    };

    onProgress({ type: "progress", message: "Generating data plan...", progress: 30 });

    const prompt = buildGenerateDataPlanPrompt(projectContext);
    const cwd = summary.project_path || process.cwd();

    const claudeStart = Date.now();
    const estimateProgress = () => Math.min(75, 30 + 45 * (1 - Math.exp(-(Date.now() - claudeStart) / 90_000)));

    const result = await runClaude({
      cwd,
      prompt,
      allowedTools: "Read,Glob,Grep,LS",
      disallowedTools: "Write,Edit,Bash",
      onProgress: (info) => {
        onProgress({
          type: "log",
          message: info.message,
          progress: Math.round(estimateProgress()),
          log: info.log,
          logType: info.logType,
          chunk: info.chunk,
        });
      },
      signal,
    });

    onProgress({ type: "progress", message: "Parsing data plan results...", progress: 80 });

    // Parse the JSON result
    // biome-ignore lint/suspicious/noExplicitAny: dynamic JSON from Claude response
    let dataPlan: Record<string, any>;
    try {
      const jsonStr = extractJsonObject(result.stdout);
      if (!jsonStr) throw new Error("No JSON found in Claude output");
      dataPlan = JSON.parse(jsonStr);
    } catch (err) {
      throw new Error(`Failed to parse data plan: ${err instanceof Error ? err.message : String(err)}`);
    }

    onProgress({ type: "progress", message: "Saving to database...", progress: 90 });

    try {
      await execute(conn, "BEGIN TRANSACTION");

      // Clear existing data
      await execute(
        conn,
        "DELETE FROM run_content WHERE run_id = ? AND content_type IN ('mock_data_entities', 'auth_overrides', 'env_items')",
        [runId],
      );

      // Save mock data entities as run_content
      if (dataPlan.entities && Array.isArray(dataPlan.entities)) {
        await execute(
          conn,
          `INSERT INTO run_content (id, run_id, content_type, data_json)
          VALUES (?, ?, 'mock_data_entities', ?)`,
          [crypto.randomUUID(), runId, JSON.stringify(dataPlan.entities)],
        );
      }

      // Save auth overrides as run_content
      if (dataPlan.authOverrides && Array.isArray(dataPlan.authOverrides)) {
        await execute(
          conn,
          `INSERT INTO run_content (id, run_id, content_type, data_json)
          VALUES (?, ?, 'auth_overrides', ?)`,
          [crypto.randomUUID(), runId, JSON.stringify(dataPlan.authOverrides)],
        );
      }

      // Save env items as run_content
      if (dataPlan.envItems && Array.isArray(dataPlan.envItems)) {
        await execute(
          conn,
          `INSERT INTO run_content (id, run_id, content_type, data_json)
          VALUES (?, ?, 'env_items', ?)`,
          [crypto.randomUUID(), runId, JSON.stringify(dataPlan.envItems)],
        );
      }

      await execute(conn, "COMMIT");
    } catch (err) {
      await execute(conn, "ROLLBACK").catch(() => {});
      throw err;
    }

    onProgress({ type: "progress", message: "Data plan complete", progress: 100 });

    return { result: dataPlan };
  };
}
