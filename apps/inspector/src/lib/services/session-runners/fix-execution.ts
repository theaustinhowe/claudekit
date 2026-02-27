import crypto from "node:crypto";
import { runClaude } from "@claudekit/claude-runner";
import type { SessionRunner } from "@/lib/services/session-manager";
import { setSessionPid } from "@/lib/services/session-manager";

export function createFixExecutionRunner(metadata: Record<string, unknown>, _contextId?: string): SessionRunner {
  return async ({ onProgress, signal, sessionId }) => {
    const fixIds = metadata.fixIds as string[];

    onProgress({
      type: "progress",
      progress: 5,
      phase: "Loading fixes",
      log: `[INFO] Loading ${fixIds.length} fix${fixIds.length !== 1 ? "es" : ""}...`,
      logType: "status",
    });

    if (signal.aborted) throw new DOMException("Aborted", "AbortError");

    const { getDb } = await import("@/lib/db");
    const { queryOne, queryAll, execute } = await import("@claudekit/duckdb");
    const { cloneOrUpdateRepo, checkoutBranch, commitAndPush, getPAT } = await import("@/lib/git-operations");

    const db = await getDb();
    const placeholders = fixIds.map(() => "?").join(",");
    const fixes = await queryAll<{
      id: string;
      comment_id: string;
      suggested_fix: string | null;
      fix_diff: string | null;
    }>(db, `SELECT id, comment_id, suggested_fix, fix_diff FROM comment_fixes WHERE id IN (${placeholders})`, fixIds);

    if (fixes.length === 0) throw new Error("No fixes found");

    // Get PR info from the first fix's comment
    const firstComment = await queryOne<{ pr_id: string }>(db, "SELECT pr_id FROM pr_comments WHERE id = ?", [
      fixes[0].comment_id,
    ]);
    if (!firstComment) throw new Error("Comment not found");

    const pr = await queryOne<{ repo_id: string; number: number; branch: string | null }>(
      db,
      "SELECT repo_id, number, branch FROM prs WHERE id = ?",
      [firstComment.pr_id],
    );
    if (!pr) throw new Error("PR not found");
    if (!pr.branch) throw new Error("PR branch unknown — cannot apply fixes");

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

    // Checkout the PR branch
    onProgress({
      type: "progress",
      progress: 15,
      phase: "Checking out branch",
      log: `[INFO] Checking out branch ${pr.branch}...`,
      logType: "status",
    });

    await checkoutBranch(repoPath, `origin/${pr.branch}`);
    // Create a local tracking branch
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execFileAsync = promisify(execFile);
    try {
      await execFileAsync("git", ["checkout", "-b", pr.branch, `origin/${pr.branch}`], { cwd: repoPath });
    } catch {
      // Branch may already exist locally
      await execFileAsync("git", ["checkout", pr.branch], { cwd: repoPath });
      await execFileAsync("git", ["pull", "origin", pr.branch], { cwd: repoPath });
    }

    const results: { fixId: string; commentId: string; status: string; commitSha: string | null }[] = [];

    for (let i = 0; i < fixes.length; i++) {
      const fix = fixes[i];
      const progress = 20 + Math.round((i / fixes.length) * 65);

      if (signal.aborted) throw new DOMException("Aborted", "AbortError");

      onProgress({
        type: "progress",
        progress,
        phase: `Applying fix ${i + 1}/${fixes.length}`,
        log: `[INFO] Applying fix for comment ${fix.comment_id}...`,
        logType: "status",
      });

      // Get comment details for context
      const comment = await queryOne<{
        body: string;
        file_path: string | null;
        line_number: number | null;
      }>(db, "SELECT body, file_path, line_number FROM pr_comments WHERE id = ?", [fix.comment_id]);

      const executionId = crypto.randomUUID();
      await execute(
        db,
        "INSERT INTO fix_executions (id, fix_id, comment_id, status, branch_name, created_at) VALUES (?, ?, ?, 'in_progress', ?, now())",
        [executionId, fix.id, fix.comment_id, pr.branch],
      );

      try {
        // Use Claude to apply the fix with full repo context
        const applyPrompt = `Apply this code fix to the repository.

## Review Comment
${comment?.body || "No comment text"}

## File
${comment?.file_path || "Unknown"}:${comment?.line_number || "?"}

## Suggested Fix
${fix.suggested_fix || "No suggestion"}

## Fix Diff
\`\`\`diff
${fix.fix_diff || "No diff available"}
\`\`\`

Apply this fix by editing the appropriate file(s). Make the minimal changes needed to address the review comment.`;

        await runClaude({
          prompt: applyPrompt,
          cwd: repoPath,
          allowedTools: "Read,Write,Edit,Bash",
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

        // Commit the changes
        const commitMsg = `fix: address review comment on ${comment?.file_path || "code"}${comment?.line_number ? `:${comment.line_number}` : ""}`;
        const sha = await commitAndPush(repoPath, pr.branch, commitMsg, pat, repo.owner, repo.name);

        await execute(
          db,
          "UPDATE fix_executions SET status = 'pushed', commit_sha = ?, completed_at = now() WHERE id = ?",
          [sha, executionId],
        );

        results.push({ fixId: fix.id, commentId: fix.comment_id, status: "pushed", commitSha: sha });

        onProgress({
          type: "progress",
          progress,
          log: `[SUCCESS] Fix applied and pushed (${sha.slice(0, 7)})`,
          logType: "status",
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        await execute(
          db,
          "UPDATE fix_executions SET status = 'failed', error_message = ?, completed_at = now() WHERE id = ?",
          [errorMsg, executionId],
        );

        results.push({ fixId: fix.id, commentId: fix.comment_id, status: "failed", commitSha: null });

        onProgress({
          type: "progress",
          progress,
          log: `[ERROR] Fix failed: ${errorMsg}`,
          logType: "error",
        });
      }
    }

    onProgress({
      type: "progress",
      progress: 100,
      phase: "Complete",
      log: `[SUCCESS] Fix execution complete — ${results.filter((r) => r.status === "pushed").length}/${fixes.length} fixes applied`,
      logType: "status",
    });

    return { result: { results } };
  };
}
