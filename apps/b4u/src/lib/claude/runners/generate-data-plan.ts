import { runClaude } from "@devkit/claude-runner";
import { buildGenerateDataPlanPrompt } from "@/lib/claude/prompts/generate-data-plan";
import type { SessionRunner } from "@/lib/claude/types";
import { execute, query } from "@/lib/db";

export function createGenerateDataPlanRunner(): SessionRunner {
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
    }>("SELECT path, title FROM routes ORDER BY id");

    const flowRows = await query<{
      id: string;
      name: string;
      steps: string[];
    }>("SELECT id, name, steps FROM user_flows ORDER BY id");

    if (flowRows.length === 0) {
      throw new Error("No user flows found. Run generate-outline first.");
    }

    const projectContext = {
      name: summary.name,
      framework: summary.framework,
      auth: summary.auth,
      database: summary.database_info,
      routes: routeRows.map((r) => ({ path: r.path, title: r.title })),
      flows: flowRows.map((f) => ({ id: f.id, name: f.name, steps: f.steps })),
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
      const jsonMatch = result.stdout.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found in Claude output");
      dataPlan = JSON.parse(jsonMatch[0]);
    } catch (err) {
      throw new Error(`Failed to parse data plan: ${err instanceof Error ? err.message : String(err)}`);
    }

    onProgress({ type: "progress", message: "Saving to database...", progress: 90 });

    // Clear existing data
    await execute("DELETE FROM mock_data_entities");
    await execute("DELETE FROM auth_overrides");
    await execute("DELETE FROM env_items");

    // Save mock data entities
    if (dataPlan.entities && Array.isArray(dataPlan.entities)) {
      for (let i = 0; i < dataPlan.entities.length; i++) {
        const e = dataPlan.entities[i];
        await execute(`
          INSERT INTO mock_data_entities (id, name, count, note)
          VALUES (${i + 1}, '${(e.name || "").replace(/'/g, "''")}', ${e.count || 5},
            '${(e.note || "").replace(/'/g, "''")}')
        `);
      }
    }

    // Save auth overrides
    if (dataPlan.authOverrides && Array.isArray(dataPlan.authOverrides)) {
      for (const ao of dataPlan.authOverrides) {
        await execute(`
          INSERT INTO auth_overrides (id, label, enabled)
          VALUES ('${(ao.id || "").replace(/'/g, "''")}', '${(ao.label || "").replace(/'/g, "''")}',
            ${ao.enabled !== false})
        `);
      }
    }

    // Save env items
    if (dataPlan.envItems && Array.isArray(dataPlan.envItems)) {
      for (const ei of dataPlan.envItems) {
        await execute(`
          INSERT INTO env_items (id, label, enabled)
          VALUES ('${(ei.id || "").replace(/'/g, "''")}', '${(ei.label || "").replace(/'/g, "''")}',
            ${ei.enabled !== false})
        `);
      }
    }

    onProgress({ type: "progress", message: "Data plan complete", progress: 100 });

    return { result: dataPlan };
  };
}
