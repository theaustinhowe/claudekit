import { runClaude } from "@claudekit/claude-runner";
import type { SessionRunner } from "@/lib/services/session-manager";
import { setSessionPid } from "@/lib/services/session-manager";

export function createSkillRuleAnalysisRunner(metadata: Record<string, unknown>, _contextId?: string): SessionRunner {
  return async ({ onProgress, signal, sessionId }) => {
    const repoId = metadata.repoId as string;
    const prNumbers = metadata.prNumbers as number[];

    onProgress({
      type: "progress",
      progress: 5,
      phase: "Preparing",
      log: "[INFO] Gathering review comments and diffs...",
      logType: "status",
    });

    if (signal.aborted) throw new DOMException("Aborted", "AbortError");

    const { getDb } = await import("@/lib/db");
    const { queryAll, queryOne, execute } = await import("@claudekit/duckdb");
    const { getSetting } = await import("@/lib/actions/settings");
    const { buildSkillRulePrompt } = await import("@/lib/prompts");
    const { fetchPRDiff } = await import("@/lib/actions/github");
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
      phase: "Fetching diffs",
      log: `[INFO] Found ${filteredComments.length} comments, fetching PR diffs...`,
      logType: "status",
    });

    if (signal.aborted) throw new DOMException("Aborted", "AbortError");

    // Get PR details and diffs
    const prs = await queryAll<{ id: string; number: number; title: string; repo_id: string }>(
      db,
      `SELECT id, number, title, repo_id FROM prs WHERE id IN (${placeholders})`,
      prIds,
    );
    const prMap = new Map(prs.map((p) => [p.id, p]));

    // Fetch diff for the first PR (or combine if multiple)
    const repo = await queryOne<{ owner: string; name: string }>(db, "SELECT owner, name FROM repos WHERE id = ?", [
      repoId,
    ]);
    if (!repo) throw new Error(`Repo not found: ${repoId}`);

    let combinedDiff = "";
    for (const pr of prs) {
      try {
        const diff = await fetchPRDiff(repo.owner, repo.name, pr.number);
        combinedDiff += `\n--- PR #${pr.number}: ${pr.title} ---\n${diff}\n`;
      } catch {
        // Skip PRs where diff fetch fails
      }
    }

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

    onProgress({
      type: "progress",
      progress: 25,
      phase: "Analyzing patterns",
      log: "[INFO] Running Claude to generate SKILL.md rules...",
      logType: "status",
    });

    if (signal.aborted) throw new DOMException("Aborted", "AbortError");

    const prompt = buildSkillRulePrompt(enrichedComments, combinedDiff);

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
      log: "[INFO] Parsing skill rule response...",
      logType: "status",
    });

    const responseText = result.stdout || "";
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("Failed to parse skill rule analysis response");

    const rulesData = JSON.parse(jsonMatch[0]) as Array<{
      name: string;
      group: string;
      severity: string;
      description: string;
      rule_content: string;
      commentIds: string[];
    }>;

    onProgress({
      type: "progress",
      progress: 85,
      phase: "Saving results",
      log: `[INFO] Found ${rulesData.length} skill rules, persisting...`,
      logType: "status",
    });

    // Create analysis record
    const analysisId = crypto.randomUUID();
    await execute(
      db,
      "INSERT INTO skill_analyses (id, repo_id, pr_numbers, created_at) VALUES (?, ?, ?, current_timestamp)",
      [analysisId, repoId, JSON.stringify(prNumbers)],
    );

    // Create/update skill groups and persist skills
    for (const rule of rulesData) {
      // Ensure group exists
      const groupId = rule.group;
      const existingGroup = await queryOne(db, "SELECT id FROM skill_groups WHERE id = ?", [groupId]);
      if (!existingGroup) {
        await execute(
          db,
          "INSERT INTO skill_groups (id, name, category, description, created_at, updated_at) VALUES (?, ?, ?, ?, current_timestamp, current_timestamp)",
          [groupId, rule.group.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()), rule.group, null],
        );
      }

      const skillId = crypto.randomUUID();

      // Validate comment IDs
      const validCommentIds: string[] = [];
      for (const commentId of rule.commentIds || []) {
        const exists = await queryOne(db, "SELECT 1 FROM pr_comments WHERE id = ?", [commentId]);
        if (exists) validCommentIds.push(commentId);
      }

      await execute(
        db,
        `INSERT INTO skills (id, analysis_id, name, frequency, total_prs, trend, severity, top_example, description, resources, action_item, addressed, comment_ids, group_id, rule_content)
         VALUES (?, ?, ?, ?, ?, 'New pattern', ?, NULL, ?, '[]', NULL, false, ?, ?, ?)`,
        [
          skillId,
          analysisId,
          rule.name,
          validCommentIds.length,
          prNumbers.length,
          rule.severity,
          rule.description,
          JSON.stringify(validCommentIds),
          groupId,
          rule.rule_content,
        ],
      );
    }

    onProgress({
      type: "progress",
      progress: 100,
      phase: "Complete",
      log: `[SUCCESS] Skill rule analysis complete — ${rulesData.length} rules generated`,
      logType: "status",
    });

    return { result: { analysisId, ruleCount: rulesData.length } };
  };
}
