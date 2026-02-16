import type { JobStatus } from "@devkit/gogo-shared";
import { execute, queryAll, queryOne } from "../db/helpers.js";
import { getConn } from "../db/index.js";
import type { DbJob } from "../db/schema.js";
import {
  AGENT_COMMENT_MARKER,
  createIssueCommentForRepo,
  getIssueCommentsForRepo,
  isHumanComment,
} from "./github/index.js";
import { applyTransitionAtomic, validateTransition } from "./state-machine.js";

/**
 * Transition a job to NEEDS_INFO state and post a question to GitHub
 */
export async function enterNeedsInfo(
  jobId: string,
  question: string,
): Promise<void> {
  const conn = getConn();
  const job = await queryOne<DbJob>(conn, "SELECT * FROM jobs WHERE id = ?", [
    jobId,
  ]);

  if (!job) {
    throw new Error(`Job ${jobId} not found`);
  }

  if (!job.repository_id) {
    throw new Error(`Job ${jobId} does not have a repository ID`);
  }

  const validation = validateTransition(job.status as JobStatus, "needs_info");
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  if (job.issue_number < 0) {
    const result = await applyTransitionAtomic(jobId, "needs_info", question, {
      needs_info_question: question,
    });
    if (!result.success) {
      throw new Error(result.error || "Failed to transition to needs_info");
    }
    console.log(
      `[needs-info] Manual job ${jobId} entered needs_info state (no GitHub comment)`,
    );
    return;
  }

  const commentBody = `${AGENT_COMMENT_MARKER}\n🤖 **Agent Question:**\n\n${question}`;
  const { id: commentId } = await createIssueCommentForRepo(
    job.repository_id,
    job.issue_number,
    commentBody,
  );

  const result = await applyTransitionAtomic(jobId, "needs_info", question, {
    needsInfoQuestion: question,
    needs_info_comment_id: commentId,
    last_checked_comment_id: commentId,
  });

  if (!result.success) {
    throw new Error(result.error || "Failed to transition to needs_info");
  }

  console.log(
    `[needs-info] Job ${jobId} entered needs_info state, GitHub comment ID: ${commentId}`,
  );
}

/**
 * Poll all jobs in NEEDS_INFO state for human responses
 */
export async function pollNeedsInfoJobs(): Promise<void> {
  const conn = getConn();
  const needsInfoJobs = await queryAll<DbJob>(
    conn,
    "SELECT * FROM jobs WHERE status = ?",
    ["needs_info"],
  );

  if (needsInfoJobs.length === 0) {
    return;
  }

  const githubJobs = needsInfoJobs.filter((job) => job.issue_number > 0);
  if (githubJobs.length === 0) {
    return;
  }

  console.log(
    `[needs-info] Polling ${githubJobs.length} jobs for responses...`,
  );

  for (const job of githubJobs) {
    try {
      await checkJobForResponse(job);
    } catch (error) {
      console.error(`[needs-info] Error checking job ${job.id}:`, error);
    }
  }
}

interface JobWithNeedsInfo {
  id: string;
  repository_id: string | null;
  issue_number: number;
  status: string;
  needs_info_question: string | null;
  needs_info_comment_id: number | null;
  last_checked_comment_id: number | null;
}

interface CheckResponseResult {
  responseFound: boolean;
}

/**
 * Check a specific job by ID for a response (for manual trigger)
 */
export async function checkJobForResponseById(
  jobId: string,
): Promise<CheckResponseResult> {
  const conn = getConn();
  const job = await queryOne<DbJob>(conn, "SELECT * FROM jobs WHERE id = ?", [
    jobId,
  ]);

  if (!job) {
    throw new Error(`Job ${jobId} not found`);
  }

  if (job.status !== "needs_info") {
    throw new Error(`Job ${jobId} is not in needs_info state`);
  }

  return checkJobForResponse(job);
}

async function checkJobForResponse(
  job: JobWithNeedsInfo,
): Promise<CheckResponseResult> {
  if (!job.needs_info_comment_id) {
    console.warn(`[needs-info] Job ${job.id} missing needs_info_comment_id`);
    return { responseFound: false };
  }

  if (!job.repository_id) {
    console.warn(`[needs-info] Job ${job.id} missing repository_id`);
    return { responseFound: false };
  }

  const comments = await getIssueCommentsForRepo(
    job.repository_id,
    job.issue_number,
    job.last_checked_comment_id ?? job.needs_info_comment_id,
  );

  const humanComments = comments.filter(isHumanComment);

  if (humanComments.length === 0) {
    if (comments.length > 0) {
      const lastCommentId = Math.max(...comments.map((c) => c.id));
      const conn = getConn();
      await execute(
        conn,
        "UPDATE jobs SET last_checked_comment_id = ? WHERE id = ?",
        [lastCommentId, job.id],
      );
    }
    return { responseFound: false };
  }

  const response = humanComments[0];
  console.log(
    `[needs-info] Job ${job.id} received response from ${response.user?.login}: ${response.body.substring(0, 100)}...`,
  );

  const conn = getConn();
  const now = new Date().toISOString();
  await execute(
    conn,
    "INSERT INTO job_events (id, job_id, event_type, from_status, to_status, message, metadata, created_at) VALUES (gen_random_uuid(), ?, ?, ?, ?, ?, ?, ?)",
    [
      job.id,
      "needs_info_response",
      null,
      null,
      response.body,
      JSON.stringify({
        githubCommentId: response.id,
        githubUser: response.user?.login,
        githubCommentUrl: response.html_url,
      }),
      now,
    ],
  );

  const result = await applyTransitionAtomic(
    job.id,
    "running",
    `Human responded on GitHub: ${response.user?.login}`,
    {
      last_checked_comment_id: response.id,
    },
  );

  if (!result.success) {
    console.error(
      `[needs-info] Failed to transition job ${job.id} to running: ${result.error}`,
    );
    return { responseFound: false };
  }

  console.log(`[needs-info] Job ${job.id} auto-resumed after human response`);
  return { responseFound: true };
}
