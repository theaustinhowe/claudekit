import { execute, queryAll, queryOne } from "@claudekit/duckdb";
import { getDb } from "../db/index.js";
import type { DbJob, DbRepository } from "../db/schema.js";
import { emitLog, type LogState } from "../utils/job-logging.js";
import { createServiceLogger } from "../utils/logger.js";
import { broadcast } from "../ws/handler.js";

const log = createServiceLogger("pr-flow");

import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import {
  commitAllChanges,
  getCommitLog,
  getRepoDir,
  hasCommits,
  isWorkingTreeClean,
  pushBranch,
  removeWorktree,
} from "./git.js";
import {
  AGENT_COMMENT_MARKER,
  createIssueCommentForRepo,
  createPullRequestForRepo,
  findExistingPrForRepo,
} from "./github/index.js";
import { enterPrReviewing } from "./pr-reviewing.js";
import { toGitConfigFromRepo } from "./settings-helper.js";
import { applyTransitionAtomic } from "./state-machine.js";
import { getMaxTestRetries, getTestCommands, runTests } from "./test-runner.js";

interface ProcessReadyToPrResult {
  success: boolean;
  error?: string;
  prUrl?: string;
  prNumber?: number;
  retriedToRunning?: boolean;
}

async function getNextLogSequence(jobId: string): Promise<number> {
  const conn = await getDb();
  const lastLog = await queryOne<{ sequence: number }>(
    conn,
    "SELECT sequence FROM job_logs WHERE job_id = ? ORDER BY sequence DESC LIMIT 1",
    [jobId],
  );

  return lastLog ? lastLog.sequence + 1 : 0;
}

async function updateJob(jobId: string, updates: Record<string, unknown>): Promise<void> {
  const conn = await getDb();
  const sets: string[] = [];
  const params: unknown[] = [];

  for (const [key, value] of Object.entries(updates)) {
    sets.push(`${key} = ?`);
    params.push(value);
  }
  sets.push("updated_at = ?");
  params.push(new Date().toISOString());
  params.push(jobId);

  await execute(conn, `UPDATE jobs SET ${sets.join(", ")} WHERE id = ?`, params);

  const updated = await queryOne<DbJob>(conn, "SELECT * FROM jobs WHERE id = ?", [jobId]);

  if (updated) {
    broadcast({ type: "job:updated", payload: updated });
  }
}

export async function processReadyToPr(jobId: string): Promise<ProcessReadyToPrResult> {
  const conn = await getDb();

  // Get current job
  const job = await queryOne<DbJob>(conn, "SELECT * FROM jobs WHERE id = ?", [jobId]);
  if (!job) {
    return { success: false, error: "Job not found" };
  }

  if (job.status !== "ready_to_pr") {
    return {
      success: false,
      error: `Job must be in 'ready_to_pr' state (current: ${job.status})`,
    };
  }

  if (!job.worktree_path) {
    return { success: false, error: "Job does not have a worktree path" };
  }

  if (!job.branch) {
    return { success: false, error: "Job does not have a branch" };
  }

  if (!job.repository_id) {
    return { success: false, error: "Job does not have a repository ID" };
  }

  // Get full repository record for git config
  const repo = await queryOne<DbRepository>(conn, "SELECT * FROM repositories WHERE id = ?", [job.repository_id]);

  if (!repo) {
    return { success: false, error: "Repository not found" };
  }

  const gitConfig = toGitConfigFromRepo({
    owner: repo.owner,
    name: repo.name,
    githubToken: repo.github_token,
    workdirPath: repo.workdir_path,
    baseBranch: repo.base_branch,
  });
  const baseBranch = repo.base_branch;
  const maxRetries = await getMaxTestRetries();

  // Initialize log state
  const logState: LogState = { sequence: await getNextLogSequence(jobId) };

  try {
    await emitLog(jobId, "system", "🚀 Starting PR creation process...", logState);

    // Step 1: Run tests (use repo-specific test command)
    const testResult = await runTests(jobId, job.worktree_path, logState, repo.test_command);

    if (!testResult.success) {
      // Tests failed
      const newRetryCount = (job.test_retry_count ?? 0) + 1;

      await emitLog(jobId, "stderr", `❌ Tests failed (attempt ${newRetryCount}/${maxRetries})`, logState);

      if (newRetryCount < maxRetries) {
        // Retry: transition back to running for agent to fix
        await emitLog(jobId, "system", "🔄 Transitioning back to running for test failure fix...", logState);

        await applyTransitionAtomic(jobId, "running", "Test failure - agent to fix", {
          test_retry_count: newRetryCount,
          last_test_output: testResult.output,
        });

        return {
          success: false,
          error: `Tests failed (attempt ${newRetryCount}/${maxRetries}). Job returned to running for agent fix.`,
          retriedToRunning: true,
        };
      }
      // Max retries reached - fail the job
      await emitLog(jobId, "stderr", `❌ Max test retries (${maxRetries}) reached. Job failed.`, logState);

      await applyTransitionAtomic(jobId, "failed", `Tests failed after ${maxRetries} attempts`, {
        test_retry_count: newRetryCount,
        last_test_output: testResult.output,
        failure_reason: `Tests failed after ${maxRetries} attempts`,
      });

      return {
        success: false,
        error: `Tests failed after ${maxRetries} attempts`,
      };
    }

    // Step 2: Check for existing PR FIRST (idempotency - if PR exists, just link to it)
    await emitLog(jobId, "system", "🔍 Checking for existing PR...", logState);
    const existingPr = await findExistingPrForRepo(job.repository_id, job.branch);
    if (existingPr) {
      await emitLog(jobId, "stdout", `✓ Found existing PR #${existingPr.number}: ${existingPr.html_url}`, logState);

      // Update job with existing PR info and transition atomically
      await applyTransitionAtomic(jobId, "pr_opened", `Linked to existing PR #${existingPr.number}`, {
        pr_number: existingPr.number,
        pr_url: existingPr.html_url,
      });

      // Also enter pr_reviewing state for existing PRs
      try {
        await enterPrReviewing(jobId);
        await emitLog(jobId, "system", "📋 PR review monitoring active", logState);
      } catch (error) {
        const err = error as Error;
        await emitLog(jobId, "stderr", `Warning: Failed to enter pr_reviewing state: ${err.message}`, logState);
      }

      return {
        success: true,
        prUrl: existingPr.html_url,
        prNumber: existingPr.number,
      };
    }
    await emitLog(jobId, "stdout", "✓ No existing PR found, will create new", logState);

    // Step 3: Check working tree is clean (auto-commit if needed)
    await emitLog(jobId, "system", "🔍 Checking working tree status...", logState);
    let didAutoCommit = false;
    const isClean = await isWorkingTreeClean(job.worktree_path);
    if (!isClean) {
      await emitLog(jobId, "system", "📝 Uncommitted changes detected, auto-committing...", logState);

      try {
        const commitMsg =
          job.issue_number < 0
            ? "chore: auto-commit remaining changes"
            : `chore: auto-commit remaining changes for issue #${job.issue_number}`;
        await commitAllChanges(job.worktree_path, commitMsg);
        didAutoCommit = true;
        await emitLog(jobId, "stdout", "✓ Auto-committed uncommitted changes", logState);
      } catch (error) {
        const err = error as Error;
        await emitLog(jobId, "stderr", `❌ Failed to auto-commit: ${err.message}`, logState);
        return {
          success: false,
          error: `Failed to auto-commit uncommitted changes: ${err.message}`,
        };
      }
    } else {
      await emitLog(jobId, "stdout", "✓ Working tree is clean", logState);
    }

    // Step 3: Check for commits (skip if we just auto-committed - we know there's at least 1)
    if (didAutoCommit) {
      await emitLog(jobId, "stdout", "✓ Commits confirmed (auto-commit created)", logState);
    } else {
      await emitLog(jobId, "system", "🔍 Checking for commits...", logState);
      const hasNewCommits = await hasCommits(gitConfig, job.worktree_path, baseBranch);
      if (!hasNewCommits) {
        await emitLog(
          jobId,
          "stderr",
          `❌ No new commits found compared to ${baseBranch}. Cannot create PR without changes.`,
          logState,
        );

        // Transition to failed - agent signaled ready but has no work to show
        await applyTransitionAtomic(jobId, "failed", "No commits found - agent signaled ready but made no changes", {
          failure_reason:
            "Agent signaled READY_TO_PR but no commits were made. The branch is identical to the base branch.",
        });

        return {
          success: false,
          error: "No commits found. Job failed - agent signaled ready but made no changes.",
        };
      }
      await emitLog(jobId, "stdout", "✓ Commits found", logState);
    }

    // Step 4: Get commit log for change summary
    await emitLog(jobId, "system", "📝 Generating change summary...", logState);
    const commitLog = await getCommitLog(gitConfig, job.worktree_path, baseBranch);
    const changeSummary = commitLog;

    await updateJob(jobId, { change_summary: changeSummary });
    await emitLog(jobId, "stdout", `Change summary:\n${changeSummary}`, logState);

    // Step 5: Push branch
    await emitLog(jobId, "system", `📤 Pushing branch ${job.branch} to origin...`, logState);
    try {
      await pushBranch(gitConfig, job.worktree_path, job.branch);
      await emitLog(jobId, "stdout", "✓ Branch pushed successfully", logState);
    } catch (error) {
      const err = error as Error;
      await emitLog(jobId, "stderr", `❌ Failed to push branch: ${err.message}`, logState);
      return {
        success: false,
        error: `Failed to push branch: ${err.message}`,
      };
    }

    // Step 7: Create pull request
    await emitLog(jobId, "system", "🔀 Creating pull request...", logState);
    const testCommands = await getTestCommands();

    const isManual = job.issue_number < 0;
    const prBody = `## Summary
${changeSummary}

## Tests Run
${testCommands.map((cmd) => `- \`${cmd}\` ✓`).join("\n")}${isManual ? "" : `\n\nFixes #${job.issue_number}`}`;

    try {
      const pr = await createPullRequestForRepo(job.repository_id, {
        head: job.branch,
        base: baseBranch,
        title: job.issue_title,
        body: prBody,
      });

      await emitLog(jobId, "stdout", `✓ Pull request created: ${pr.html_url}`, logState);

      // Step 8: Create issue comment (skip for manual jobs)
      if (!isManual) {
        await emitLog(jobId, "system", "💬 Commenting on issue...", logState);
        const commentBody = `${AGENT_COMMENT_MARKER}
**PR Created**: ${pr.html_url}

### Changes
${changeSummary}

### Tests Run
${testCommands.map((cmd) => `- \`${cmd}\` ✓`).join("\n")}`;

        await createIssueCommentForRepo(job.repository_id, job.issue_number, commentBody);
        await emitLog(jobId, "stdout", "✓ Issue comment created", logState);
      }

      // Step 9: Transition to pr_opened atomically
      await applyTransitionAtomic(jobId, "pr_opened", `PR #${pr.number} created`, {
        pr_number: pr.number,
        pr_url: pr.html_url,
      });

      await emitLog(jobId, "system", "🎉 PR created! Now monitoring for review feedback...", logState);

      // Step 10: Automatically enter pr_reviewing state to monitor for feedback
      try {
        await enterPrReviewing(jobId);
        await emitLog(jobId, "system", "📋 PR review monitoring active", logState);
      } catch (error) {
        const err = error as Error;
        await emitLog(jobId, "stderr", `Warning: Failed to enter pr_reviewing state: ${err.message}`, logState);
        // Continue - PR was created successfully even if we can't monitor
      }

      // Step 11: Auto-clean worktree — branch is pushed, local copy is no longer needed
      try {
        await removeWorktree(gitConfig, job.worktree_path);

        const repoDir = getRepoDir(gitConfig);
        const normalizedRepoDir = resolve(repoDir);
        const worktreeName = job.issue_number < 0 ? `manual-${job.id.slice(0, 8)}` : `issue-${job.issue_number}`;
        const jobDir = resolve(repoDir, "jobs", worktreeName);
        if (jobDir.startsWith(normalizedRepoDir)) {
          await rm(jobDir, { recursive: true, force: true });
        }

        await updateJob(jobId, { worktree_path: null });
        await emitLog(jobId, "system", "🧹 Worktree cleaned up (will restore if review feedback received)", logState);
      } catch (cleanupError) {
        const cleanupErr = cleanupError as Error;
        log.warn({ err: cleanupErr, jobId }, "Non-fatal: failed to clean up worktree after PR creation");
      }

      return {
        success: true,
        prUrl: pr.html_url,
        prNumber: pr.number,
      };
    } catch (error) {
      const err = error as Error;
      await emitLog(jobId, "stderr", `❌ Failed to create pull request: ${err.message}`, logState);
      return {
        success: false,
        error: `Failed to create pull request: ${err.message}`,
      };
    }
  } catch (error) {
    const err = error as Error;
    await emitLog(jobId, "stderr", `❌ Unexpected error: ${err.message}`, logState);
    return {
      success: false,
      error: `Unexpected error: ${err.message}`,
    };
  }
}

/**
 * Poll all jobs in ready_to_pr state and process them
 *
 * This function finds jobs that are ready for PR creation and automatically
 * runs the PR flow (tests, push, create PR) for each one.
 * Only processes jobs where the repository has autoCreatePr enabled.
 */
export async function pollReadyToPrJobs(): Promise<void> {
  const conn = await getDb();

  // Get repositories with auto PR creation enabled
  const autoCreatePrRepos = await queryAll<{ id: string }>(
    conn,
    "SELECT id FROM repositories WHERE is_active = true AND auto_create_pr = true",
  );

  if (autoCreatePrRepos.length === 0) {
    return;
  }

  const repoIds = autoCreatePrRepos.map((r) => r.id);

  // Query all jobs in ready_to_pr state that don't already have a PR
  const readyJobs = await queryAll<DbJob>(conn, "SELECT * FROM jobs WHERE status = ? AND pr_number IS NULL", [
    "ready_to_pr",
  ]);

  // Filter to only jobs in repos with autoCreatePr enabled
  const eligibleJobs = readyJobs.filter((job) => job.repository_id && repoIds.includes(job.repository_id));

  if (eligibleJobs.length === 0) {
    return;
  }

  log.info({ jobCount: eligibleJobs.length }, "Processing jobs ready for PR creation");

  for (const job of eligibleJobs) {
    try {
      log.info({ jobId: job.id, issueNumber: job.issue_number }, "Processing job for PR creation");
      const result = await processReadyToPr(job.id);

      if (result.success) {
        log.info({ jobId: job.id, prUrl: result.prUrl }, "Job PR created successfully");
      } else if (result.retriedToRunning) {
        log.info({ jobId: job.id }, "Job returned to running for test fixes");
      } else {
        log.error({ jobId: job.id, error: result.error }, "Job PR creation failed");
      }
    } catch (error) {
      log.error({ err: error, jobId: job.id }, "Error processing job");
    }
  }
}
