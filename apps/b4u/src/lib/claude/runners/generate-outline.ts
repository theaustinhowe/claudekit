import { runClaude } from "@/lib/claude/claude-runner";
import { buildGenerateOutlinePrompt } from "@/lib/claude/prompts/generate-outline";
import type { SessionRunner } from "@/lib/claude/types";
import { execute, query } from "@/lib/db";

export function createGenerateOutlineRunner(): SessionRunner {
  return async ({ onProgress, signal }) => {
    onProgress({ type: "progress", message: "Loading project context...", progress: 10 });

    // Read project context from DB
    const summaryRows = await query<{
      name: string;
      framework: string;
      auth: string;
      database_info: string;
      project_path: string;
    }>("SELECT name, framework, auth, database_info, project_path FROM project_summary LIMIT 1");

    if (summaryRows.length === 0) {
      throw new Error("No project summary found. Run analyze-project first.");
    }

    const summary = summaryRows[0];

    const routeRows = await query<{
      path: string;
      title: string;
      auth_required: boolean;
      description: string;
    }>("SELECT path, title, auth_required, description FROM routes ORDER BY id");

    const projectContext = {
      name: summary.name,
      framework: summary.framework,
      auth: summary.auth,
      database: summary.database_info,
      routes: routeRows.map((r) => ({
        path: r.path,
        title: r.title,
        authRequired: r.auth_required,
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
    await execute("DELETE FROM routes");
    await execute("DELETE FROM user_flows");

    // Save updated routes
    if (outline.routes && Array.isArray(outline.routes)) {
      for (let i = 0; i < outline.routes.length; i++) {
        const r = outline.routes[i];
        await execute(`
          INSERT INTO routes (id, path, title, auth_required, description)
          VALUES (${i + 1}, '${(r.path || "").replace(/'/g, "''")}', '${(r.title || "").replace(/'/g, "''")}',
            ${!!r.authRequired}, '${(r.description || "").replace(/'/g, "''")}')
        `);
      }
    }

    // Save user flows
    if (outline.flows && Array.isArray(outline.flows)) {
      for (const flow of outline.flows) {
        const steps = (flow.steps || []).map((s: string) => `'${s.replace(/'/g, "''")}'`).join(", ");
        await execute(`
          INSERT INTO user_flows (id, name, steps)
          VALUES ('${(flow.id || "").replace(/'/g, "''")}', '${(flow.name || "").replace(/'/g, "''")}', [${steps}])
        `);
      }
    }

    onProgress({ type: "progress", message: "Outline complete", progress: 100 });

    return { result: outline };
  };
}
