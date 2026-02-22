import { randomUUID } from "node:crypto";
import { execute, queryAll, queryOne } from "@claudekit/duckdb";
import type { JobStatus } from "@claudekit/gogo-shared";
import { getDb } from "../db/index.js";
import type { DbJob } from "../db/schema.js";
import { createServiceLogger } from "../utils/logger.js";
import {
  AGENT_COMMENT_MARKER,
  createIssueCommentForRepo,
  getIssueCommentsForRepo,
  isHumanComment,
} from "./github/index.js";
import { applyTransitionAtomic, validateTransition } from "./state-machine.js";

const log = createServiceLogger("needs-info");

/**
 * Transition a job to NEEDS_INFO state and post a question to GitHub
 */
export async function enterNeedsInfo(jobId: string, question: string): Promise<void> {
  const conn = await getDb();
  const job = await queryOne<DbJob>(conn, "SELECT * FROM jobs WHERE id = ?", [jobId]);

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
    log.info({ jobId }, "Manual job entered needs_info state (no GitHub comment)");
    return;
  }

  const commentBody = `${AGENT_COMMENT_MARKER}\n🤖 **Agent Question:**\n\n${question}`;
  const { id: commentId } = await createIssueCommentForRepo(job.repository_id, job.issue_number, commentBody);

  const result = await applyTransitionAtomic(jobId, "needs_info", question, {
    needsInfoQuestion: question,
    needs_info_comment_id: commentId,
    last_checked_comment_id: commentId,
  });

  if (!result.success) {
    throw new Error(result.error || "Failed to transition to needs_info");
  }

  log.info({ jobId, commentId }, "Job entered needs_info state");
}

/**
 * Poll all jobs in NEEDS_INFO state for human responses
 */
export async function pollNeedsInfoJobs(): Promise<void> {
  const conn = await getDb();
  const needsInfoJobs = await queryAll<DbJob>(conn, "SELECT * FROM jobs WHERE status = ?", ["needs_info"]);

  if (needsInfoJobs.length === 0) {
    return;
  }

  const githubJobs = needsInfoJobs.filter((job) => job.issue_number > 0);
  if (githubJobs.length === 0) {
    return;
  }

  log.info({ jobCount: githubJobs.length }, "Polling jobs for responses");

  for (const job of githubJobs) {
    try {
      await checkJobForResponse(job);
    } catch (error) {
      log.error({ err: error, jobId: job.id }, "Error checking job");
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
export async function checkJobForResponseById(jobId: string): Promise<CheckResponseResult> {
  const conn = await getDb();
  const job = await queryOne<DbJob>(conn, "SELECT * FROM jobs WHERE id = ?", [jobId]);

  if (!job) {
    throw new Error(`Job ${jobId} not found`);
  }

  if (job.status !== "needs_info") {
    throw new Error(`Job ${jobId} is not in needs_info state`);
  }

  return checkJobForResponse(job);
}

async function checkJobForResponse(job: JobWithNeedsInfo): Promise<CheckResponseResult> {
  if (!job.needs_info_comment_id) {
    log.warn({ jobId: job.id }, "Job missing needs_info_comment_id");
    return { responseFound: false };
  }

  if (!job.repository_id) {
    log.warn({ jobId: job.id }, "Job missing repository_id");
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
      const conn = await getDb();
      await execute(conn, "UPDATE jobs SET last_checked_comment_id = ? WHERE id = ?", [lastCommentId, job.id]);
    }
    return { responseFound: false };
  }

  const response = humanComments[0];
  log.info(
    { jobId: job.id, from: response.user?.login, response: response.body.substring(0, 100) },
    "Job received response",
  );

  const conn = await getDb();
  const now = new Date().toISOString();
  await execute(
    conn,
    "INSERT INTO job_events (id, job_id, event_type, from_status, to_status, message, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [
      randomUUID(),
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

  const result = await applyTransitionAtomic(job.id, "running", `Human responded on GitHub: ${response.user?.login}`, {
    last_checked_comment_id: response.id,
  });

  if (!result.success) {
    log.error({ jobId: job.id, error: result.error }, "Failed to transition job to running");
    return { responseFound: false };
  }

  log.info({ jobId: job.id }, "Job auto-resumed after human response");
  return { responseFound: true };
}
