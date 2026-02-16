/**
 * Issue Sync Service
 *
 * Polls GitHub for issues and comments, storing them locally in DuckDB.
 * Uses incremental sync via GitHub's `since` parameter to minimize API calls.
 */

import { execute, queryAll, queryOne } from "@devkit/duckdb";
import { getConn } from "../db/index.js";
import type { DbRepository } from "../db/schema.js";
import { broadcast } from "../ws/handler.js";
import { type GitHubComment, type GitHubIssue, getIssueCommentsForRepo, getIssuesForRepo } from "./github/index.js";

/**
 * Upsert a GitHub issue into the local database
 */
async function upsertIssue(repositoryId: string, ghIssue: GitHubIssue): Promise<void> {
  const conn = getConn();
  const now = new Date().toISOString();

  // Check if issue already exists locally
  const existing = await queryOne<{ id: string }>(
    conn,
    "SELECT id FROM issues WHERE repository_id = ? AND number = ? LIMIT 1",
    [repositoryId, ghIssue.number],
  );

  if (existing) {
    await execute(
      conn,
      "UPDATE issues SET title = ?, body = ?, state = ?, html_url = ?, author_login = ?, author_avatar_url = ?, author_html_url = ?, labels = ?, github_updated_at = ?, closed_at = ?, last_synced_at = ?, updated_at = ? WHERE id = ?",
      [
        ghIssue.title,
        ghIssue.body,
        ghIssue.state,
        ghIssue.html_url,
        ghIssue.user?.login ?? null,
        ghIssue.user?.avatar_url ?? null,
        ghIssue.user?.html_url ?? null,
        JSON.stringify(ghIssue.labels),
        ghIssue.updated_at,
        ghIssue.closed_at ?? null,
        now,
        now,
        existing.id,
      ],
    );
  } else {
    await execute(
      conn,
      "INSERT INTO issues (id, repository_id, number, title, body, state, html_url, author_login, author_avatar_url, author_html_url, labels, github_created_at, github_updated_at, closed_at, last_synced_at, created_at, updated_at) VALUES (gen_random_uuid(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        repositoryId,
        ghIssue.number,
        ghIssue.title,
        ghIssue.body,
        ghIssue.state,
        ghIssue.html_url,
        ghIssue.user?.login ?? null,
        ghIssue.user?.avatar_url ?? null,
        ghIssue.user?.html_url ?? null,
        JSON.stringify(ghIssue.labels),
        ghIssue.created_at,
        ghIssue.updated_at,
        ghIssue.closed_at ?? null,
        now,
        now,
        now,
      ],
    );
  }
}

/**
 * Check if an issue was edited after its corresponding job was created.
 * If so, create a github_sync event on the job to surface the divergence.
 */
async function detectIssueEditForJob(repositoryId: string, ghIssue: GitHubIssue): Promise<void> {
  const issueUpdatedAt = new Date(ghIssue.updated_at);
  const conn = getConn();

  // Find active jobs for this issue (not done, not failed)
  const activeJobs = await queryAll<{
    id: string;
    created_at: string;
    issue_body: string | null;
  }>(conn, "SELECT id, created_at, issue_body FROM jobs WHERE repository_id = ? AND issue_number = ?", [
    repositoryId,
    ghIssue.number,
  ]);

  for (const job of activeJobs) {
    // Skip terminal states
    const currentJob = await queryOne<{ status: string }>(conn, "SELECT status FROM jobs WHERE id = ?", [job.id]);

    if (!currentJob || currentJob.status === "done" || currentJob.status === "failed") {
      continue;
    }

    // Check if the issue was edited after the job was created
    const jobCreatedAt = new Date(job.created_at);
    if (issueUpdatedAt > jobCreatedAt) {
      // Check if the body actually changed (not just a label or status change)
      const currentBody = ghIssue.body ?? null;
      const jobBody = job.issue_body ?? null;
      if (currentBody === jobBody) continue;

      // Create a github_sync event to surface the divergence
      const now = new Date().toISOString();
      await execute(
        conn,
        "INSERT INTO job_events (id, job_id, event_type, message, metadata, created_at) VALUES (gen_random_uuid(), ?, ?, ?, ?, ?)",
        [
          job.id,
          "github_sync",
          "Issue was edited after job creation - requirements may have changed",
          JSON.stringify({
            issueUpdatedAt: issueUpdatedAt.toISOString(),
            jobCreatedAt: jobCreatedAt.toISOString(),
            fieldsChanged: ["body"],
          }),
          now,
        ],
      );

      broadcast({
        type: "job:updated",
        payload: {
          id: job.id,
          issueEdited: true,
          issueEditedAt: issueUpdatedAt.toISOString(),
        },
      });

      console.log(`[issue-sync] Issue #${ghIssue.number} was edited after job ${job.id} was created`);
    }
  }
}

/**
 * Upsert a GitHub comment into the local database
 */
async function upsertComment(repositoryId: string, issueNumber: number, ghComment: GitHubComment): Promise<void> {
  const conn = getConn();
  const now = new Date().toISOString();

  const existing = await queryOne<{ id: string }>(
    conn,
    "SELECT id FROM issue_comments WHERE repository_id = ? AND github_comment_id = ? LIMIT 1",
    [repositoryId, ghComment.id],
  );

  if (existing) {
    await execute(
      conn,
      "UPDATE issue_comments SET body = ?, html_url = ?, author_login = ?, author_type = ?, author_avatar_url = ?, github_updated_at = ?, last_synced_at = ?, updated_at = ? WHERE id = ?",
      [
        ghComment.body,
        ghComment.html_url,
        ghComment.user?.login ?? null,
        ghComment.user?.type ?? null,
        ghComment.user?.avatar_url ?? null,
        ghComment.updated_at,
        now,
        now,
        existing.id,
      ],
    );
  } else {
    await execute(
      conn,
      "INSERT INTO issue_comments (id, repository_id, issue_number, github_comment_id, body, html_url, author_login, author_type, author_avatar_url, github_created_at, github_updated_at, last_synced_at, created_at, updated_at) VALUES (gen_random_uuid(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        repositoryId,
        issueNumber,
        ghComment.id,
        ghComment.body,
        ghComment.html_url,
        ghComment.user?.login ?? null,
        ghComment.user?.type ?? null,
        ghComment.user?.avatar_url ?? null,
        ghComment.created_at,
        ghComment.updated_at,
        now,
        now,
        now,
      ],
    );
  }
}

/**
 * Sync issues for a single repository.
 * Uses incremental sync if lastIssueSyncAt is set.
 */
export async function syncIssuesForRepo(repositoryId: string): Promise<{ synced: number; comments: number }> {
  const conn = getConn();

  // Get repo config including last sync time
  const repo = await queryOne<DbRepository>(conn, "SELECT * FROM repositories WHERE id = ?", [repositoryId]);

  if (!repo) return { synced: 0, comments: 0 };

  const since = repo.last_issue_sync_at ?? undefined;

  // Fetch all open issues (and recently updated closed ones if doing incremental)
  const ghIssues = await getIssuesForRepo(repositoryId, {
    state: since ? "all" : "open",
    per_page: 100,
    since,
  });

  let syncedCount = 0;
  let commentCount = 0;

  for (const ghIssue of ghIssues) {
    // Detect edits before upserting (so we can compare against old snapshot)
    await detectIssueEditForJob(repositoryId, ghIssue);

    await upsertIssue(repositoryId, ghIssue);
    syncedCount++;

    // Sync comments for issues that were updated since our last sync
    // (or all issues on first sync)
    const comments = await getIssueCommentsForRepo(repositoryId, ghIssue.number);

    for (const comment of comments) {
      await upsertComment(repositoryId, ghIssue.number, comment);
      commentCount++;
    }
  }

  // Update the repository's last sync timestamp
  const now = new Date().toISOString();
  await execute(conn, "UPDATE repositories SET last_issue_sync_at = ?, updated_at = ? WHERE id = ?", [
    now,
    now,
    repositoryId,
  ]);

  return { synced: syncedCount, comments: commentCount };
}

/**
 * Sync comments for a single issue (used for on-demand refresh)
 */
export async function syncCommentsForIssue(repositoryId: string, issueNumber: number): Promise<number> {
  const comments = await getIssueCommentsForRepo(repositoryId, issueNumber);

  let count = 0;
  for (const comment of comments) {
    await upsertComment(repositoryId, issueNumber, comment);
    count++;
  }

  return count;
}

/**
 * Sync issues and comments for all active repositories.
 * Called from the main polling loop.
 */
export async function syncAllIssues(): Promise<void> {
  const conn = getConn();
  const repos = await queryAll<DbRepository>(conn, "SELECT * FROM repositories WHERE is_active = true");

  let totalIssues = 0;
  let totalComments = 0;

  for (const repo of repos) {
    try {
      const { synced, comments } = await syncIssuesForRepo(repo.id);
      totalIssues += synced;
      totalComments += comments;
    } catch (error) {
      console.error(`[issue-sync] Failed to sync issues for ${repo.owner}/${repo.name}:`, error);
    }
  }

  if (totalIssues > 0 || totalComments > 0) {
    console.log(`[issue-sync] Synced ${totalIssues} issues and ${totalComments} comments`);
    // Notify connected clients that issues were synced
    broadcast({
      type: "issue:synced",
      payload: { issues: totalIssues, comments: totalComments },
    });
  }
}
