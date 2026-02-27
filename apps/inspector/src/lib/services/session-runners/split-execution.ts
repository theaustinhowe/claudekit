import crypto from "node:crypto";
import type { SessionRunner } from "@/lib/services/session-manager";

export function createSplitExecutionRunner(metadata: Record<string, unknown>, _contextId?: string): SessionRunner {
  return async ({ onProgress, signal }) => {
    const planId = metadata.planId as string;

    onProgress({
      type: "progress",
      progress: 5,
      phase: "Loading plan",
      log: "[INFO] Loading split plan...",
      logType: "status",
    });

    if (signal.aborted) throw new DOMException("Aborted", "AbortError");

    const { getDb } = await import("@/lib/db");
    const { queryOne, execute } = await import("@claudekit/duckdb");
    const { cloneOrUpdateRepo, createBranch, checkoutFiles, commitAndPush, createGitHubPR, getPAT } = await import(
      "@/lib/git-operations"
    );

    const db = await getDb();
    const plan = await queryOne<{
      id: string;
      pr_id: string;
      total_lines: number;
      sub_prs: string;
    }>(db, "SELECT * FROM split_plans WHERE id = ?", [planId]);
    if (!plan) throw new Error("Split plan not found");

    const subPRs = typeof plan.sub_prs === "string" ? JSON.parse(plan.sub_prs) : plan.sub_prs;

    // Get PR and repo info
    const pr = await queryOne<{ repo_id: string; number: number; title: string; branch: string | null }>(
      db,
      "SELECT repo_id, number, title, branch FROM prs WHERE id = ?",
      [plan.pr_id],
    );
    if (!pr) throw new Error("PR not found");

    const repo = await queryOne<{ owner: string; name: string; default_branch: string }>(
      db,
      "SELECT owner, name, default_branch FROM repos WHERE id = ?",
      [pr.repo_id],
    );
    if (!repo) throw new Error("Repo not found");

    const pat = getPAT();

    onProgress({
      type: "progress",
      progress: 10,
      phase: "Cloning repo",
      log: `[INFO] Cloning ${repo.owner}/${repo.name}...`,
      logType: "status",
    });

    if (signal.aborted) throw new DOMException("Aborted", "AbortError");

    const repoPath = await cloneOrUpdateRepo(repo.owner, repo.name, pat);

    // Update local_path
    await execute(db, "UPDATE repos SET local_path = ? WHERE id = ?", [repoPath, pr.repo_id]);

    // Sort sub-PRs by dependency order
    const sorted = [...subPRs].sort(
      (a: { dependsOn?: number[]; index: number }, b: { dependsOn?: number[]; index: number }) => {
        if (a.dependsOn?.includes(b.index)) return 1;
        if (b.dependsOn?.includes(a.index)) return -1;
        return a.index - b.index;
      },
    );

    const createdPRs: { index: number; number: number; url: string }[] = [];

    for (let i = 0; i < sorted.length; i++) {
      const subPR = sorted[i];
      const progress = 15 + Math.round((i / sorted.length) * 75);

      if (signal.aborted) throw new DOMException("Aborted", "AbortError");

      const slug = subPR.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .slice(0, 30);
      const branchName = `split/${pr.number}/${subPR.index}-${slug}`;

      onProgress({
        type: "progress",
        progress,
        phase: `Creating sub-PR ${subPR.index}/${sorted.length}`,
        log: `[INFO] Creating branch ${branchName}...`,
        logType: "status",
      });

      const executionId = crypto.randomUUID();
      await execute(
        db,
        "INSERT INTO split_executions (id, plan_id, sub_pr_index, status, branch_name, created_at) VALUES (?, ?, ?, 'in_progress', ?, current_timestamp)",
        [executionId, planId, subPR.index, branchName],
      );

      try {
        // Create branch from default branch
        await createBranch(repoPath, repo.default_branch, branchName);

        // Checkout files from the PR branch
        const files = (subPR.files || []).map((f: { path: string }) => f.path);
        if (files.length > 0 && pr.branch) {
          await checkoutFiles(repoPath, `origin/${pr.branch}`, files);
        }

        // Commit and push
        const commitMsg = `${subPR.title}\n\nSplit from PR #${pr.number} (${subPR.index}/${subPR.total})\n\n${subPR.description}`;
        await commitAndPush(repoPath, branchName, commitMsg, pat, repo.owner, repo.name);

        // Create PR on GitHub
        const deps = (subPR.dependsOn || [])
          .map((d: number) => {
            const dep = createdPRs.find((p) => p.index === d);
            return dep ? `Depends on #${dep.number}` : null;
          })
          .filter(Boolean)
          .join("\n");

        const prBody = `## ${subPR.title}\n\n${subPR.description}\n\nSplit from #${pr.number} (sub-PR ${subPR.index}/${subPR.total})\n\n${deps ? `### Dependencies\n${deps}\n` : ""}### Checklist\n${(subPR.checklist || []).map((c: string) => `- [ ] ${c}`).join("\n")}`;

        const created = await createGitHubPR(
          repo.owner,
          repo.name,
          branchName,
          repo.default_branch,
          subPR.title,
          prBody,
        );

        createdPRs.push({ index: subPR.index, number: created.number, url: created.url });

        await execute(
          db,
          "UPDATE split_executions SET status = 'completed', pr_number = ?, pr_url = ?, completed_at = current_timestamp WHERE id = ?",
          [created.number, created.url, executionId],
        );

        onProgress({
          type: "progress",
          progress,
          phase: `Sub-PR ${subPR.index} created`,
          log: `[SUCCESS] Created PR #${created.number}: ${subPR.title}`,
          logType: "status",
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        await execute(
          db,
          "UPDATE split_executions SET status = 'failed', error_message = ?, completed_at = current_timestamp WHERE id = ?",
          [errorMsg, executionId],
        );

        onProgress({
          type: "progress",
          progress,
          log: `[ERROR] Failed sub-PR ${subPR.index}: ${errorMsg}`,
          logType: "error",
        });
      }
    }

    onProgress({
      type: "progress",
      progress: 100,
      phase: "Complete",
      log: `[SUCCESS] Split execution complete — ${createdPRs.length}/${sorted.length} PRs created`,
      logType: "status",
    });

    return { result: { planId, createdPRs } };
  };
}
