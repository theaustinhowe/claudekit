import { runClaude } from "@claudekit/claude-runner";
import type { SessionRunner } from "@claudekit/session";
import { buildGenerateOutlinePrompt } from "@/lib/claude/prompts/generate-outline";
import { execute, getDb, queryAll, queryOne } from "@/lib/db";

export function createGenerateOutlineRunner(runId?: string): SessionRunner {
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
      runId
        ? "SELECT name, framework, auth, database_info, project_path FROM project_summary WHERE run_id = ? LIMIT 1"
        : "SELECT name, framework, auth, database_info, project_path FROM project_summary LIMIT 1",
      runId ? [runId] : [],
    );

    if (summaryRows.length === 0) {
      throw new Error("No project summary found. Run analyze-project first.");
    }

    const summary = summaryRows[0];

    // Read routes from run_content
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

    const routeRows: Array<{ path: string; title: string; authRequired: boolean; description: string }> = routesRow
      ? JSON.parse(routesRow.data_json)
      : [];

    const projectContext = {
      name: summary.name,
      framework: summary.framework,
      auth: summary.auth,
      database: summary.database_info,
      routes: routeRows.map((r) => ({
        path: r.path,
        title: r.title,
        authRequired: r.authRequired,
        description: r.description,
      })),
    };

    onProgress({ type: "progress", message: "Generating demo outline...", progress: 30 });

    const prompt = buildGenerateOutlinePrompt(projectContext);
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

    onProgress({ type: "progress", message: "Parsing outline results...", progress: 80 });

    // Parse the JSON result
    // biome-ignore lint/suspicious/noExplicitAny: dynamic JSON from Claude response
    let outline: Record<string, any>;
    try {
      const jsonMatch = result.stdout.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found in Claude output");
      outline = JSON.parse(jsonMatch[0]);
    } catch (err) {
      throw new Error(`Failed to parse outline: ${err instanceof Error ? err.message : String(err)}`);
    }

    onProgress({ type: "progress", message: "Saving to database...", progress: 90 });

    // Clear existing data
    await execute(conn, "DELETE FROM run_content WHERE run_id = ? AND content_type IN ('routes', 'user_flows')", [
      runId,
    ]);

    // Save updated routes as run_content
    if (outline.routes && Array.isArray(outline.routes)) {
      await execute(
        conn,
        `INSERT INTO run_content (id, run_id, content_type, data_json)
        VALUES (?, ?, 'routes', ?)`,
        [crypto.randomUUID(), runId, JSON.stringify(outline.routes)],
      );
    }

    // Save user flows as run_content
    if (outline.flows && Array.isArray(outline.flows)) {
      await execute(
        conn,
        `INSERT INTO run_content (id, run_id, content_type, data_json)
        VALUES (?, ?, 'user_flows', ?)`,
        [crypto.randomUUID(), runId, JSON.stringify(outline.flows)],
      );
    }

    onProgress({ type: "progress", message: "Outline complete", progress: 100 });

    return { result: outline };
  };
}
