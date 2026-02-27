import { runClaude } from "@claudekit/claude-runner";
import type { SessionRunner } from "@claudekit/session";
import { extractJsonObject } from "@/lib/claude/extract-json";
import { buildAnalyzeProjectPrompt } from "@/lib/claude/prompts/analyze-project";
import { execute, getDb } from "@/lib/db";

export function createAnalyzeProjectRunner(projectPath: string, runId: string): SessionRunner {
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
      const jsonStr = extractJsonObject(result.stdout);
      if (!jsonStr) throw new Error("No JSON found in Claude output");
      analysis = JSON.parse(jsonStr);
    } catch (err) {
      throw new Error(`Failed to parse analysis: ${err instanceof Error ? err.message : String(err)}`);
    }

    onProgress({ type: "progress", message: "Saving to database...", progress: 90 });

    const conn = await getDb();

    // Wrap delete-then-insert in a transaction for atomicity
    try {
      await execute(conn, "BEGIN TRANSACTION");

      // Clear existing data and save new
      await execute(conn, "DELETE FROM project_summary WHERE run_id = ?", [runId]);
      await execute(conn, "DELETE FROM run_content WHERE run_id = ? AND content_type IN ('routes', 'file_tree')", [
        runId,
      ]);

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

      // Save routes as run_content if present
      if (analysis.routes && Array.isArray(analysis.routes)) {
        await execute(
          conn,
          `INSERT INTO run_content (id, run_id, content_type, data_json)
          VALUES (?, ?, 'routes', ?)`,
          [crypto.randomUUID(), runId, JSON.stringify(analysis.routes)],
        );
      }

      // Save file tree as run_content if Claude returned one
      if (analysis.fileTree || analysis.file_tree) {
        const treeData = analysis.fileTree || analysis.file_tree;
        await execute(
          conn,
          `INSERT INTO run_content (id, run_id, content_type, data_json)
          VALUES (?, ?, 'file_tree', ?)`,
          [crypto.randomUUID(), runId, JSON.stringify(treeData)],
        );
      }

      await execute(conn, "COMMIT");
    } catch (err) {
      await execute(conn, "ROLLBACK").catch(() => {});
      throw err;
    }

    onProgress({ type: "progress", message: "Analysis complete", progress: 100 });

    return { result: analysis };
  };
}
