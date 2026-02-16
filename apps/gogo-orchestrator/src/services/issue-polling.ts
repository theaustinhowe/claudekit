import { execute, queryAll, queryOne } from "@devkit/duckdb";
import { getConn } from "../db/index.js";
import type { DbJob, DbRepository } from "../db/schema.js";
import { broadcast } from "../ws/handler.js";
import { type GitHubIssue, getIssuesWithLabel, removeLabelFromIssue } from "./github/index.js";

/**
 * Get all active repositories that have auto-create enabled
 */
async function getActiveRepositories(): Promise<DbRepository[]> {
  const conn = getConn();
  return queryAll<DbRepository>(conn, "SELECT * FROM repositories WHERE is_active = true AND auto_create_jobs = true");
}

/**
 * Check if a job already exists for an issue
 */
async function jobExistsForIssue(repositoryId: string, issueNumber: number): Promise<boolean> {
  const conn = getConn();
  const existing = await queryOne<{ id: string }>(
    conn,
    "SELECT id FROM jobs WHERE repository_id = ? AND issue_number = ? LIMIT 1",
    [repositoryId, issueNumber],
  );

  return !!existing;
}

/**
 * Create a job from a GitHub issue
 */
async function createJobFromIssue(repositoryId: string, issue: GitHubIssue): Promise<void> {
  const conn = getConn();
  const now = new Date().toISOString();

  await execute(
    conn,
    "INSERT INTO jobs (id, repository_id, issue_number, issue_title, issue_url, issue_body, status, created_at, updated_at) VALUES (gen_random_uuid(), ?, ?, ?, ?, ?, ?, ?, ?)",
    [repositoryId, issue.number, issue.title, issue.html_url, issue.body, "queued", now, now],
  );

  // Fetch the newly created job
  const newJob = await queryOne<DbJob>(
    conn,
    "SELECT * FROM jobs WHERE repository_id = ? AND issue_number = ? AND status = ? ORDER BY created_at DESC LIMIT 1",
    [repositoryId, issue.number, "queued"],
  );

  if (!newJob) return;

  // Create job creation event
  await execute(
    conn,
    "INSERT INTO job_events (id, job_id, event_type, from_status, to_status, message, created_at) VALUES (gen_random_uuid(), ?, ?, ?, ?, ?, ?)",
    [newJob.id, "state_change", null, "queued", "Job auto-created from labeled issue", now],
  );

  // Broadcast job created
  broadcast({ type: "job:created", payload: newJob });

  console.log(`[issue-polling] Created job for issue #${issue.number}: ${issue.title}`);
}

/**
 * Poll for labeled issues and create jobs
 */
export async function pollForLabeledIssues(): Promise<{
  checked: number;
  created: number;
}> {
  const repos = await getActiveRepositories();
  let totalChecked = 0;
  let totalCreated = 0;

  for (const repo of repos) {
    // Use the service layer to fetch issues
    const issues = await getIssuesWithLabel(repo.id, repo.trigger_label);
    totalChecked += issues.length;

    for (const issue of issues) {
      // Check if job already exists
      const exists = await jobExistsForIssue(repo.id, issue.number);

      if (!exists) {
        await createJobFromIssue(repo.id, issue);
        totalCreated++;

        // Optionally remove the label after creating the job
        if (repo.remove_label_after_create) {
          await removeLabelFromIssue(repo.id, issue.number, repo.trigger_label);
        }
      }
    }
  }

  if (totalCreated > 0) {
    console.log(`[issue-polling] Created ${totalCreated} new jobs from ${totalChecked} labeled issues`);
  }

  return { checked: totalChecked, created: totalCreated };
}
