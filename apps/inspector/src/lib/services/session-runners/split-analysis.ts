import crypto from "node:crypto";
import { runClaude } from "@claudekit/claude-runner";
import type { SessionRunner } from "@/lib/services/session-manager";
import { setSessionPid } from "@/lib/services/session-manager";

export function createSplitAnalysisRunner(metadata: Record<string, unknown>, _contextId?: string): SessionRunner {
  return async ({ onProgress, signal, sessionId }) => {
    const prId = metadata.prId as string;

    onProgress({
      type: "progress",
      progress: 5,
      phase: "Loading PR",
      log: "[INFO] Fetching PR details...",
      logType: "status",
    });

    if (signal.aborted) throw new DOMException("Aborted", "AbortError");

    const { getDb } = await import("@/lib/db");
    const { queryOne, execute } = await import("@claudekit/duckdb");
    const { fetchPRDiff } = await import("@/lib/actions/github");
    const { buildSplitPlanPrompt } = await import("@/lib/prompts");

    const db = await getDb();
    const pr = await queryOne<{
      id: string;
      repo_id: string;
      number: number;
      title: string;
      files_changed: number;
      lines_added: number;
      lines_deleted: number;
    }>(db, "SELECT id, repo_id, number, title, files_changed, lines_added, lines_deleted FROM prs WHERE id = ?", [
      prId,
    ]);

    if (!pr) throw new Error(`PR not found: ${prId}`);

    const repo = await queryOne<{ owner: string; name: string }>(db, "SELECT owner, name FROM repos WHERE id = ?", [
      pr.repo_id,
    ]);
    if (!repo) throw new Error(`Repo not found: ${pr.repo_id}`);

    onProgress({
      type: "progress",
      progress: 15,
      phase: "Fetching diff",
      log: `[INFO] Fetching diff for PR #${pr.number}...`,
      logType: "status",
    });

    if (signal.aborted) throw new DOMException("Aborted", "AbortError");

    const diff = await fetchPRDiff(repo.owner, repo.name, pr.number);

    onProgress({
      type: "progress",
      progress: 25,
      phase: "Analyzing structure",
      log: "[INFO] Running Claude split analysis...",
      logType: "status",
    });

    if (signal.aborted) throw new DOMException("Aborted", "AbortError");

    const prompt = buildSplitPlanPrompt({
      number: pr.number,
      title: pr.title,
      filesChanged: pr.files_changed,
      diff,
    });

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
      progress: 80,
      phase: "Processing results",
      log: "[INFO] Parsing split plan response...",
      logType: "status",
    });

    const responseText = result.stdout || "";
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("Failed to parse split plan response");

    const subPRs = JSON.parse(jsonMatch[0]);

    const planId = crypto.randomUUID();
    const totalLines = pr.lines_added + pr.lines_deleted;

    await execute(
      db,
      "INSERT INTO split_plans (id, pr_id, total_lines, sub_prs, created_at) VALUES (?, ?, ?, ?, current_timestamp)",
      [planId, prId, totalLines, JSON.stringify(subPRs)],
    );

    onProgress({
      type: "progress",
      progress: 100,
      phase: "Complete",
      log: `[SUCCESS] Split plan ready — ${subPRs.length} sub-PRs generated`,
      logType: "status",
    });

    return { result: { planId, subPRCount: subPRs.length } };
  };
}
