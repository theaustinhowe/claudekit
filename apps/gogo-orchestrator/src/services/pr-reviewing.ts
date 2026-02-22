/**
 * PR Review Polling Service
 *
 * Handles polling for PR review feedback and merge status.
 * Completes the automation loop: issue -> PR -> review feedback -> done
 */

import { rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { execute, queryAll, queryOne } from "@claudekit/duckdb";
import { getDb } from "../db/index.js";
import type { DbJob, DbRepository } from "../db/schema.js";
import { createServiceLogger } from "../utils/logger.js";
import { broadcast } from "../ws/handler.js";
import { resumeAgent } from "./agent-executor.js";
import { getRepoDir, removeWorktree } from "./git.js";
import {
  type GitHubComment,
  getPullRequestByNumber,
  getPullRequestIssueComments,
  getPullRequestReviewComments,
  isHumanComment,
  isHumanReviewComment,
  type PullRequestReviewComment,
} from "./github/index.js";
import { toGitConfigFromRepo } from "./settings-helper.js";
import { applyTransitionAtomic } from "./state-machine.js";

const log = createServiceLogger("pr-reviewing");

/**
 * Transition a job to pr_reviewing state
 */
export async function enterPrReviewing(jobId: string): Promise<void> {
  const conn = await getDb();
  const job = await queryOne<DbJob>(conn, "SELECT * FROM jobs WHERE id = ?", [jobId]);

  if (!job) {
    throw new Error(`Job ${jobId} not found`);
  }

  if (job.status !== "pr_opened") {
    throw new Error(`Job ${jobId} must be in pr_opened state to enter pr_reviewing (current: ${job.status})`);
  }

  const result = await applyTransitionAtomic(jobId, "pr_reviewing", "Monitoring PR for review feedback", {
    last_checked_pr_review_comment_id: null,
  });

  if (!result.success) {
    throw new Error(result.error || "Failed to transition to pr_reviewing");
  }

  log.info({ jobId }, "Job entered pr_reviewing state");
}

interface JobWithPr {
  id: string;
  repository_id: string | null;
  pr_number: number | null;
  status: string;
  last_checked_comment_id: number | null;
  last_checked_pr_review_comment_id: number | null;
  agent_type: string | null;
  claude_session_id: string | null;
  worktree_path: string | null;
  issue_number: number;
}

/**
 * Poll all jobs in pr_reviewing state for review feedback or merge status
 */
export async function pollPrReviewingJobs(): Promise<void> {
  const conn = await getDb();
  const prReviewingJobs = await queryAll<DbJob>(conn, "SELECT * FROM jobs WHERE status = ?", ["pr_reviewing"]);

  if (prReviewingJobs.length === 0) {
    return;
  }

  log.info({ jobCount: prReviewingJobs.length }, "Polling jobs for PR review feedback");

  for (const job of prReviewingJobs) {
    try {
      await checkPrStatus(job);
    } catch (error) {
      log.error({ err: error, jobId: job.id }, "Error checking job");
    }
  }
}

async function checkPrStatus(job: JobWithPr): Promise<void> {
  if (!job.pr_number) {
    log.warn({ jobId: job.id }, "Job missing pr_number");
    return;
  }

  if (!job.repository_id) {
    log.warn({ jobId: job.id }, "Job missing repository_id");
    return;
  }

  const prInfo = await getPullRequestByNumber(job.repository_id, job.pr_number);

  if (!prInfo) {
    log.warn({ jobId: job.id, prNumber: job.pr_number }, "Could not fetch PR for job");
    return;
  }

  if (prInfo.merged) {
    log.info({ jobId: job.id, prNumber: job.pr_number }, "PR was merged");

    const conn = await getDb();
    const now = new Date().toISOString();
    await execute(
      conn,
      "INSERT INTO job_events (id, job_id, event_type, message, metadata, created_at) VALUES (gen_random_uuid(), ?, ?, ?, ?, ?)",
      [
        job.id,
        "github_sync",
        `PR #${job.pr_number} was merged`,
        JSON.stringify({ prNumber: job.pr_number, mergedAt: prInfo.merged_at }),
        now,
      ],
    );

    await applyTransitionAtomic(job.id, "done", `PR #${job.pr_number} merged`);
    await cleanupWorktreeAfterMerge(job);
    return;
  }

  if (prInfo.state === "closed" && !prInfo.merged) {
    log.info({ jobId: job.id, prNumber: job.pr_number }, "PR was closed without merge");

    const conn = await getDb();
    const now = new Date().toISOString();
    await execute(
      conn,
      "INSERT INTO job_events (id, job_id, event_type, message, metadata, created_at) VALUES (gen_random_uuid(), ?, ?, ?, ?, ?)",
      [
        job.id,
        "github_sync",
        `PR #${job.pr_number} was closed without merge`,
        JSON.stringify({ prNumber: job.pr_number, state: prInfo.state }),
        now,
      ],
    );

    await applyTransitionAtomic(job.id, "paused", `PR #${job.pr_number} closed without merge`, {
      pause_reason: "PR was closed without being merged",
    });
    return;
  }

  await checkForReviewFeedback(job);
}

async function checkForReviewFeedback(job: JobWithPr): Promise<void> {
  if (!job.pr_number || !job.repository_id) return;

  const reviewComments = await getPullRequestReviewComments(
    job.repository_id,
    job.pr_number,
    job.last_checked_pr_review_comment_id ?? undefined,
  );

  const issueComments = await getPullRequestIssueComments(
    job.repository_id,
    job.pr_number,
    job.last_checked_comment_id ?? undefined,
  );

  const humanReviewComments = reviewComments.filter(isHumanReviewComment);
  const humanIssueComments = issueComments.filter(isHumanComment);

  // Update tracking IDs even if no human comments
  const conn = await getDb();
  const sets: string[] = [];
  const params: unknown[] = [];

  if (reviewComments.length > 0) {
    const maxReviewId = Math.max(...reviewComments.map((c) => c.id));
    sets.push("last_checked_pr_review_comment_id = ?");
    params.push(maxReviewId);
  }
  if (issueComments.length > 0) {
    const maxIssueId = Math.max(...issueComments.map((c) => c.id));
    sets.push("last_checked_comment_id = ?");
    params.push(maxIssueId);
  }

  if (sets.length > 0) {
    sets.push("updated_at = ?");
    params.push(new Date().toISOString());
    params.push(job.id);
    await execute(conn, `UPDATE jobs SET ${sets.join(", ")} WHERE id = ?`, params);
  }

  if (humanReviewComments.length === 0 && humanIssueComments.length === 0) {
    return;
  }

  const feedback = formatReviewFeedback(humanReviewComments, humanIssueComments);

  log.info({ jobId: job.id, feedback: feedback.substring(0, 100) }, "Job received review feedback");

  const now = new Date().toISOString();
  await execute(
    conn,
    "INSERT INTO job_events (id, job_id, event_type, message, metadata, created_at) VALUES (gen_random_uuid(), ?, ?, ?, ?, ?)",
    [
      job.id,
      "pr_review_feedback",
      feedback,
      JSON.stringify({
        reviewCommentCount: humanReviewComments.length,
        issueCommentCount: humanIssueComments.length,
        reviewers: [
          ...new Set([
            ...humanReviewComments.map((c) => c.user?.login).filter(Boolean),
            ...humanIssueComments.map((c) => c.user?.login).filter(Boolean),
          ]),
        ],
      }),
      now,
    ],
  );

  const result = await applyTransitionAtomic(job.id, "running", "Received PR review feedback");

  if (!result.success) {
    log.error({ jobId: job.id, error: result.error }, "Failed to transition job to running");
    return;
  }

  const updatedJob = await queryOne<DbJob>(conn, "SELECT * FROM jobs WHERE id = ?", [job.id]);
  if (updatedJob) {
    broadcast({ type: "job:updated", payload: updatedJob });
  }

  if (job.claude_session_id) {
    const resumeMessage = `PR Review Feedback Received:\n\n${feedback}\n\nPlease address the review comments and update the PR.`;

    const resumeResult = await resumeAgent(job.id, resumeMessage, job.agent_type || undefined);

    if (!resumeResult.success) {
      log.error({ jobId: job.id, error: resumeResult.error }, "Failed to resume agent for job");
    }
  } else {
    log.info({ jobId: job.id }, "Job has no session to resume, moved to running for manual action");
  }
}

function formatReviewFeedback(reviewComments: PullRequestReviewComment[], issueComments: GitHubComment[]): string {
  const parts: string[] = [];

  if (reviewComments.length > 0) {
    parts.push("## Inline Code Review Comments\n");
    for (const comment of reviewComments) {
      const location = comment.path ? `File: ${comment.path}${comment.line ? `:${comment.line}` : ""}` : "";
      parts.push(`### ${comment.user?.login || "Reviewer"}${location ? ` - ${location}` : ""}\n${comment.body}\n`);
    }
  }

  if (issueComments.length > 0) {
    parts.push("## PR Conversation Comments\n");
    for (const comment of issueComments) {
      parts.push(`### ${comment.user?.login || "Reviewer"}\n${comment.body}\n`);
    }
  }

  return parts.join("\n");
}

async function cleanupWorktreeAfterMerge(job: JobWithPr): Promise<void> {
  if (!job.worktree_path) {
    log.info({ jobId: job.id }, "Job has no worktree path, skipping cleanup");
    return;
  }

  if (!job.repository_id) {
    log.info({ jobId: job.id }, "Job has no repository ID, skipping cleanup");
    return;
  }

  try {
    const conn = await getDb();
    const repo = await queryOne<DbRepository>(conn, "SELECT * FROM repositories WHERE id = ?", [job.repository_id]);

    if (!repo) {
      log.warn({ jobId: job.id, repositoryId: job.repository_id }, "Repository not found for job");
      return;
    }

    const gitConfig = toGitConfigFromRepo({
      owner: repo.owner,
      name: repo.name,
      githubToken: repo.github_token,
      workdirPath: repo.workdir_path,
      baseBranch: repo.base_branch,
    });
    const repoDir = getRepoDir(gitConfig);

    const normalizedRepoDir = resolve(repoDir);
    const normalizedWorktreePath = resolve(job.worktree_path);
    if (!normalizedWorktreePath.startsWith(normalizedRepoDir)) {
      log.warn({ jobId: job.id }, "Job worktree path is outside repo directory, skipping cleanup");
      return;
    }

    log.info({ jobId: job.id, worktreePath: job.worktree_path }, "Auto-cleaning up worktree for job");

    await removeWorktree(gitConfig, job.worktree_path);

    const jobsDir = join(repoDir, "jobs", `issue-${job.issue_number}`);
    const normalizedJobsDir = resolve(jobsDir);
    if (normalizedJobsDir.startsWith(normalizedRepoDir)) {
      try {
        await rm(normalizedJobsDir, { recursive: true, force: true });
      } catch {
        // Directory may not exist or already deleted
      }
    }

    const now = new Date().toISOString();
    await execute(conn, "UPDATE jobs SET worktree_path = NULL, updated_at = ? WHERE id = ?", [now, job.id]);

    await execute(
      conn,
      "INSERT INTO job_events (id, job_id, event_type, message, metadata, created_at) VALUES (gen_random_uuid(), ?, ?, ?, ?, ?)",
      [
        job.id,
        "auto_cleanup",
        "Worktree automatically cleaned up after PR merge",
        JSON.stringify({
          cleanedWorktreePath: job.worktree_path,
          cleanedJobsDir: normalizedJobsDir,
        }),
        now,
      ],
    );

    const updated = await queryOne<DbJob>(conn, "SELECT * FROM jobs WHERE id = ?", [job.id]);
    if (updated) {
      broadcast({ type: "job:updated", payload: updated });
    }

    log.info({ jobId: job.id }, "Successfully cleaned up worktree for job");
  } catch (error) {
    log.error({ err: error, jobId: job.id }, "Failed to cleanup worktree for job");
  }
}
