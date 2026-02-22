/**
 * PR Recovery Service
 *
 * Recovers orphaned PRs on startup when the database has been reset.
 * Scans GitHub for open PRs matching the agent branch pattern and
 * creates job records for them.
 */

import { randomUUID } from "node:crypto";
import { execute, queryAll, queryOne } from "@claudekit/duckdb";
import { getDb } from "../db/index.js";
import type { DbJob, DbRepository } from "../db/schema.js";
import { createServiceLogger } from "../utils/logger.js";
import { broadcast } from "../ws/handler.js";
import { getIssueByNumber, getOpenPullRequestsForRepo } from "./github/index.js";
import { enterPrReviewing } from "./pr-reviewing.js";

const log = createServiceLogger("pr-recovery");

/**
 * Extract issue number from branch name
 * Matches patterns like: agent/issue-123-some-slug, agent/123-slug, etc.
 */
function extractIssueNumberFromBranch(branch: string): number | null {
  // Pattern 1: agent/issue-{number}-{slug} (default pattern)
  const issuePattern = /^agent\/issue-(\d+)/;
  const issueMatch = branch.match(issuePattern);
  if (issueMatch) {
    return parseInt(issueMatch[1], 10);
  }

  // Pattern 2: agent/{number}-{slug} (alternative pattern)
  const numericPattern = /^agent\/(\d+)-/;
  const numericMatch = branch.match(numericPattern);
  if (numericMatch) {
    return parseInt(numericMatch[1], 10);
  }

  return null;
}

/**
 * Check if a job already exists for an issue in a repository
 */
async function jobExistsForIssue(repositoryId: string, issueNumber: number): Promise<boolean> {
  const conn = await getDb();
  const existing = await queryOne<{ id: string }>(
    conn,
    "SELECT id FROM jobs WHERE repository_id = ? AND issue_number = ? LIMIT 1",
    [repositoryId, issueNumber],
  );

  return !!existing;
}

interface RecoveryResult {
  repositoriesChecked: number;
  prsScanned: number;
  jobsRecovered: number;
  errors: string[];
}

/**
 * Recover orphaned PRs for all active repositories
 *
 * This function:
 * 1. Gets all active repositories
 * 2. For each repo, fetches all open PRs from GitHub
 * 3. For PRs with agent branch patterns, extracts issue number
 * 4. Creates job records in pr_reviewing state if no job exists
 */
export async function recoverOrphanedPrs(): Promise<RecoveryResult> {
  const result: RecoveryResult = {
    repositoriesChecked: 0,
    prsScanned: 0,
    jobsRecovered: 0,
    errors: [],
  };

  const conn = await getDb();

  // Get all active repositories
  const repos = await queryAll<DbRepository>(conn, "SELECT * FROM repositories WHERE is_active = true");

  result.repositoriesChecked = repos.length;

  for (const repo of repos) {
    try {
      // Fetch all open PRs for this repository
      const openPrs = await getOpenPullRequestsForRepo(repo.id);
      result.prsScanned += openPrs.length;

      for (const pr of openPrs) {
        // Extract issue number from branch name
        const issueNumber = extractIssueNumberFromBranch(pr.head_ref);
        if (!issueNumber) {
          // Not an agent PR, skip
          continue;
        }

        // Check if job already exists
        const exists = await jobExistsForIssue(repo.id, issueNumber);
        if (exists) {
          // Job exists, skip
          continue;
        }

        // Fetch issue details from GitHub
        const issue = await getIssueByNumber(repo.id, issueNumber);
        if (!issue) {
          result.errors.push(`PR #${pr.number}: Could not fetch issue #${issueNumber} for ${repo.owner}/${repo.name}`);
          continue;
        }

        // Create job record in pr_reviewing state
        const now = new Date().toISOString();
        await execute(
          conn,
          "INSERT INTO jobs (id, repository_id, issue_number, issue_title, issue_url, issue_body, status, branch, pr_number, pr_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [
            randomUUID(),
            repo.id,
            issue.number,
            issue.title,
            issue.html_url,
            issue.body,
            "pr_reviewing",
            pr.head_ref,
            pr.number,
            pr.html_url,
            now,
            now,
          ],
        );

        // Fetch the newly created job
        const newJob = await queryOne<DbJob>(
          conn,
          "SELECT * FROM jobs WHERE repository_id = ? AND issue_number = ? AND status = ? ORDER BY created_at DESC LIMIT 1",
          [repo.id, issue.number, "pr_reviewing"],
        );

        if (!newJob) {
          result.errors.push(`PR #${pr.number}: Failed to create job record for issue #${issueNumber}`);
          continue;
        }

        // Create audit event
        await execute(
          conn,
          "INSERT INTO job_events (id, job_id, event_type, from_status, to_status, message, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          [
            randomUUID(),
            newJob.id,
            "state_change",
            null,
            "pr_reviewing",
            `Job recovered from orphaned PR #${pr.number} on startup`,
            JSON.stringify({ triggeredBy: "pr_recovery", prNumber: pr.number }),
            now,
          ],
        );

        // Broadcast job created
        broadcast({ type: "job:created", payload: newJob });

        // Enter PR reviewing state to set up monitoring
        try {
          await enterPrReviewing(newJob.id);
        } catch (error) {
          // Non-fatal - job is created, monitoring can be retried
          const err = error as Error;
          log.warn({ jobId: newJob.id, err }, "Failed to enter pr_reviewing for recovered job");
        }

        result.jobsRecovered++;
        log.info(
          { issueNumber, prNumber: pr.number, owner: repo.owner, repo: repo.name },
          "Recovered job from orphaned PR",
        );
      }
    } catch (error) {
      const err = error as Error;
      result.errors.push(`Repository ${repo.owner}/${repo.name}: ${err.message}`);
    }
  }

  return result;
}
