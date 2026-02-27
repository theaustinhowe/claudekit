import { runClaude } from "@claudekit/claude-runner";
import type { SessionRunner } from "@/lib/services/session-manager";
import { setSessionPid } from "@/lib/services/session-manager";

export function createSkillAnalysisRunner(metadata: Record<string, unknown>, _contextId?: string): SessionRunner {
  return async ({ onProgress, signal, sessionId }) => {
    const repoId = metadata.repoId as string;
    const prNumbers = metadata.prNumbers as number[];

    onProgress({
      type: "progress",
      progress: 5,
      phase: "Preparing",
      log: "[INFO] Gathering review comments...",
      logType: "status",
    });

    if (signal.aborted) throw new DOMException("Aborted", "AbortError");

    // Gather comments — dynamic import to avoid server action in non-server context
    const { getDb } = await import("@/lib/db");
    const { queryAll, queryOne } = await import("@claudekit/duckdb");
    const { getSetting } = await import("@/lib/actions/settings");
    const { buildSkillAnalysisPrompt } = await import("@/lib/prompts");
    const { execute } = await import("@claudekit/duckdb");
    const crypto = await import("node:crypto");

    const db = await getDb();
    const prIds = prNumbers.map((n) => `${repoId}#${n}`);
    const placeholders = prIds.map(() => "?").join(",");

    const comments = await queryAll<{
      id: string;
      reviewer: string;
      body: string;
      file_path: string | null;
      line_number: number | null;
      pr_id: string;
    }>(
      db,
      `SELECT id, reviewer, body, file_path, line_number, pr_id FROM pr_comments WHERE pr_id IN (${placeholders})`,
      prIds,
    );

    if (comments.length === 0) throw new Error("No comments found for selected PRs");

    const ignoreBots = await getSetting("ignore_bots");
    const filteredComments = ignoreBots !== "false" ? comments.filter((c) => !c.reviewer.includes("[bot]")) : comments;

    if (filteredComments.length === 0) throw new Error("No comments remain after filtering bots");

    onProgress({
      type: "progress",
      progress: 15,
      phase: "Extracting comments",
      log: `[INFO] Found ${filteredComments.length} comments across ${prNumbers.length} PRs`,
      logType: "status",
    });

    if (signal.aborted) throw new DOMException("Aborted", "AbortError");

    // Get PR titles for context
    const prs = await queryAll<{ id: string; number: number; title: string }>(
      db,
      `SELECT id, number, title FROM prs WHERE id IN (${placeholders})`,
      prIds,
    );
    const prMap = new Map(prs.map((p) => [p.id, p]));

    const enrichedComments = filteredComments.map((c) => {
      const pr = prMap.get(c.pr_id);
      return {
        id: c.id,
        reviewer: c.reviewer,
        body: c.body,
        filePath: c.file_path,
        lineNumber: c.line_number,
        prNumber: pr?.number ?? 0,
        prTitle: pr?.title ?? "",
      };
    });

    const prompt = buildSkillAnalysisPrompt(enrichedComments);

    onProgress({
      type: "progress",
      progress: 25,
      phase: "Analyzing patterns",
      log: "[INFO] Running Claude analysis...",
      logType: "status",
    });

    if (signal.aborted) throw new DOMException("Aborted", "AbortError");

    const result = await runClaude({
      prompt,
      cwd: process.cwd(),
      allowedTools: "",
      signal,
      onPid: (pid) => setSessionPid(sessionId, pid),
      onProgress: (info) => {
        onProgress({
          type: "progress",
          message: info.message,
          log: info.log,
          logType: info.logType,
        });
      },
    });

    onProgress({
      type: "progress",
      progress: 75,
      phase: "Processing results",
      log: "[INFO] Parsing skill analysis response...",
      logType: "status",
    });

    // Parse JSON from Claude's response
    const responseText = result.stdout || "";
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("Failed to parse skill analysis response");

    const skillsData = JSON.parse(jsonMatch[0]) as Array<{
      name: string;
      severity: string;
      frequency: number;
      trend: string;
      topExample: string;
      description: string;
      commentIds: string[];
      resources: { title: string; url: string }[];
      actionItem: string;
    }>;

    onProgress({
      type: "progress",
      progress: 85,
      phase: "Saving results",
      log: `[INFO] Found ${skillsData.length} skill patterns, persisting...`,
      logType: "status",
    });

    // Persist analysis
    const analysisId = crypto.randomUUID();
    await execute(db, "INSERT INTO skill_analyses (id, repo_id, pr_numbers, created_at) VALUES (?, ?, ?, now())", [
      analysisId,
      repoId,
      JSON.stringify(prNumbers),
    ]);

    for (const skill of skillsData) {
      const skillId = crypto.randomUUID();

      // Filter comment IDs to only those that exist in pr_comments
      const validCommentIds: string[] = [];
      for (const commentId of skill.commentIds || []) {
        const exists = await queryOne(db, "SELECT 1 FROM pr_comments WHERE id = ?", [commentId]);
        if (exists) {
          validCommentIds.push(commentId);
        }
      }

      await execute(
        db,
        `INSERT INTO skills (id, analysis_id, name, frequency, total_prs, trend, severity, top_example, description, resources, action_item, addressed, comment_ids)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, false, ?)`,
        [
          skillId,
          analysisId,
          skill.name,
          skill.frequency,
          prNumbers.length,
          skill.trend,
          skill.severity,
          skill.topExample,
          skill.description,
          JSON.stringify(skill.resources),
          skill.actionItem,
          JSON.stringify(validCommentIds),
        ],
      );
    }

    onProgress({
      type: "progress",
      progress: 100,
      phase: "Complete",
      log: `[SUCCESS] Skill analysis complete — ${skillsData.length} patterns found`,
      logType: "status",
    });

    return { result: { analysisId, skillCount: skillsData.length } };
  };
}
