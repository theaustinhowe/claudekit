import { runClaude } from "@claudekit/claude-runner";
import type { SessionRunner } from "@claudekit/session";
import { buildAnalyzeProjectPrompt } from "@/lib/claude/prompts/analyze-project";
import { execute, getDb } from "@/lib/db";

export function createAnalyzeProjectRunner(projectPath: string, runId?: string): SessionRunner {
  return async ({ onProgress, signal }) => {
    onProgress({ type: "progress", message: "Analyzing project structure...", progress: 10 });

    const prompt = buildAnalyzeProjectPrompt(projectPath);

    // Estimate progress during Claude execution (10% → 75%, asymptotic)
    const claudeStart = Date.now();
    const estimateProgress = () => {
      const elapsed = (Date.now() - claudeStart) / 1000;
      // Asymptotic curve: approaches 75% over ~3 minutes
      return Math.min(75, 10 + 65 * (1 - Math.exp(-elapsed / 90)));
    };

    const result = await runClaude({
      cwd: projectPath,
      prompt,
      allowedTools: "Read,Glob,Grep,LS",
      disallowedTools: "Write,Edit,Bash",
      onProgress: (info) => {
        onProgress({
          type: "log",
          message: info.message,
          progress: Math.round(estimateProgress()),
          log: info.log || info.message,
          logType: info.logType || "status",
          chunk: info.chunk,
        });
      },
      signal,
    });

    onProgress({ type: "progress", message: "Parsing analysis results...", progress: 80 });

    // Parse the JSON result from Claude
    // biome-ignore lint/suspicious/noExplicitAny: dynamic JSON from Claude response
    let analysis: Record<string, any>;
    try {
      // Try to extract JSON from the result (Claude might wrap it in markdown)
      const jsonMatch = result.stdout.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found in Claude output");
      analysis = JSON.parse(jsonMatch[0]);
    } catch (err) {
      throw new Error(`Failed to parse analysis: ${err instanceof Error ? err.message : String(err)}`);
    }

    onProgress({ type: "progress", message: "Saving to database...", progress: 90 });

    const conn = await getDb();

    // Clear existing data and save new
    await execute(conn, "DELETE FROM project_summary WHERE run_id = ?", [runId]);
    await execute(conn, "DELETE FROM routes WHERE run_id = ?", [runId]);

    // Save project summary
    const dirs = analysis.directories || [];
    await execute(
      conn,
      `INSERT INTO project_summary (id, run_id, name, framework, directories, auth, database_info, project_path)
      VALUES (1, ?, ?, ?, ?::VARCHAR[], ?, ?, ?)`,
      [
        runId,
        analysis.name || "",
        analysis.framework || "",
        JSON.stringify(dirs),
        analysis.auth || "None",
        analysis.database || "None",
        projectPath,
      ],
    );

    // Save routes if present
    if (analysis.routes && Array.isArray(analysis.routes)) {
      for (let i = 0; i < analysis.routes.length; i++) {
        const r = analysis.routes[i];
        await execute(
          conn,
          `INSERT INTO routes (id, run_id, path, title, auth_required, description)
          VALUES (?, ?, ?, ?, ?, ?)`,
          [i + 1, runId, r.path || "", r.title || "", !!r.authRequired, r.description || ""],
        );
      }
    }

    // Save file tree if Claude returned one
    if (analysis.fileTree || analysis.file_tree) {
      await execute(conn, "DELETE FROM file_tree WHERE run_id = ?", [runId]);
      const treeJson = JSON.stringify(analysis.fileTree || analysis.file_tree);
      await execute(conn, "INSERT INTO file_tree (id, run_id, tree_json) VALUES (1, ?, ?)", [runId, treeJson]);
    }

    onProgress({ type: "progress", message: "Analysis complete", progress: 100 });

    return { result: analysis };
  };
}
