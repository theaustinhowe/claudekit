import { execute, queryAll, queryOne } from "../db/helpers.js";
import { getConn } from "../db/index.js";
import type { DbJob } from "../db/schema.js";
import { getIssueCommentsForRepo, isHumanComment } from "./github/index.js";

// Keywords that indicate plan approval
const APPROVAL_PATTERN = /\b(approve[d]?|lgtm|looks good|ship it|go ahead)\b/i;

/**
 * Poll all jobs in AWAITING_PLAN_APPROVAL state for human responses on GitHub
 */
export async function pollPlanApprovalJobs(): Promise<void> {
  const conn = getConn();
  const awaitingJobs = await queryAll<DbJob>(conn, "SELECT * FROM jobs WHERE status = ?", ["awaiting_plan_approval"]);

  if (awaitingJobs.length === 0) {
    return;
  }

  const githubJobs = awaitingJobs.filter((job) => job.issue_number > 0);
  if (githubJobs.length === 0) {
    return;
  }

  console.log(`[plan-approval] Polling ${githubJobs.length} jobs for plan approval...`);

  for (const job of githubJobs) {
    try {
      await checkJobForPlanApproval(job);
    } catch (error) {
      console.error(`[plan-approval] Error checking job ${job.id}:`, error);
    }
  }
}

interface PlanApprovalJob {
  id: string;
  repository_id: string | null;
  issue_number: number;
  status: string;
  plan_content: string | null;
  plan_comment_id: number | null;
  last_checked_plan_comment_id: number | null;
}

async function checkJobForPlanApproval(job: PlanApprovalJob): Promise<void> {
  if (!job.plan_comment_id) {
    console.warn(`[plan-approval] Job ${job.id} missing plan_comment_id`);
    return;
  }

  if (!job.repository_id) {
    console.warn(`[plan-approval] Job ${job.id} missing repository_id`);
    return;
  }

  const comments = await getIssueCommentsForRepo(
    job.repository_id,
    job.issue_number,
    job.last_checked_plan_comment_id ?? job.plan_comment_id,
  );

  const humanComments = comments.filter(isHumanComment);

  if (humanComments.length === 0) {
    if (comments.length > 0) {
      const lastCommentId = Math.max(...comments.map((c) => c.id));
      const conn = getConn();
      await execute(conn, "UPDATE jobs SET last_checked_plan_comment_id = ? WHERE id = ?", [lastCommentId, job.id]);
    }
    return;
  }

  const conn = getConn();
  const now = new Date().toISOString();
  const response = humanComments[0];
  const isApproval = APPROVAL_PATTERN.test(response.body);

  if (isApproval) {
    console.log(`[plan-approval] Job ${job.id} plan approved by ${response.user?.login}`);

    await execute(
      conn,
      "INSERT INTO job_events (id, job_id, event_type, from_status, to_status, message, metadata, created_at) VALUES (gen_random_uuid(), ?, ?, ?, ?, ?, ?, ?)",
      [
        job.id,
        "plan_approved",
        "awaiting_plan_approval",
        "running",
        `Plan approved by ${response.user?.login || "human"}`,
        JSON.stringify({
          githubCommentId: response.id,
          githubUser: response.user?.login,
          githubCommentUrl: response.html_url,
        }),
        now,
      ],
    );

    await execute(conn, "UPDATE jobs SET status = ?, last_checked_plan_comment_id = ?, updated_at = ? WHERE id = ?", [
      "running",
      response.id,
      now,
      job.id,
    ]);

    const updated = await queryOne<DbJob>(conn, "SELECT * FROM jobs WHERE id = ?", [job.id]);
    if (updated) {
      const { broadcast } = await import("../ws/handler.js");
      broadcast({ type: "job:updated", payload: updated });
    }

    console.log(`[plan-approval] Job ${job.id} transitioned to running after plan approval`);
  } else {
    console.log(
      `[plan-approval] Job ${job.id} received feedback from ${response.user?.login}: ${response.body.substring(0, 100)}...`,
    );

    await execute(
      conn,
      "INSERT INTO job_events (id, job_id, event_type, from_status, to_status, message, metadata, created_at) VALUES (gen_random_uuid(), ?, ?, ?, ?, ?, ?, ?)",
      [
        job.id,
        "state_change",
        "awaiting_plan_approval",
        "planning",
        `Plan feedback from ${response.user?.login || "human"}: ${response.body}`,
        JSON.stringify({
          githubCommentId: response.id,
          githubUser: response.user?.login,
          githubCommentUrl: response.html_url,
          feedback: response.body,
        }),
        now,
      ],
    );

    await execute(conn, "UPDATE jobs SET status = ?, last_checked_plan_comment_id = ?, updated_at = ? WHERE id = ?", [
      "planning",
      response.id,
      now,
      job.id,
    ]);

    const updated = await queryOne<DbJob>(conn, "SELECT * FROM jobs WHERE id = ?", [job.id]);
    if (updated) {
      const { broadcast } = await import("../ws/handler.js");
      broadcast({ type: "job:updated", payload: updated });
    }

    console.log(`[plan-approval] Job ${job.id} returned to planning for revision`);
  }
}
