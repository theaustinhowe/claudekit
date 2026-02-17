"use server";

import { classifyPRSize } from "@/lib/constants";
import { execute, getDb, queryAll, queryOne } from "@/lib/db";
import { getOctokit } from "@/lib/github";

export async function syncRepo(owner: string, name: string) {
  const octokit = getOctokit();
  const { data: repo } = await octokit.rest.repos.get({ owner, repo: name });

  const db = await getDb();
  const id = `${owner}/${name}`;

  await execute(
    db,
    `INSERT INTO repos (id, owner, name, full_name, default_branch, last_synced_at, created_at)
     VALUES (?, ?, ?, ?, ?, current_timestamp, current_timestamp)
     ON CONFLICT (id) DO UPDATE SET
       default_branch = excluded.default_branch,
       last_synced_at = current_timestamp`,
    [id, owner, name, repo.full_name, repo.default_branch || "main"],
  );

  return { id, fullName: repo.full_name, defaultBranch: repo.default_branch || "main" };
}

export async function syncPRs(repoId: string) {
  const octokit = getOctokit();
  const db = await getDb();

  const repo = await queryOne<{ owner: string; name: string }>(db, "SELECT owner, name FROM repos WHERE id = ?", [
    repoId,
  ]);
  if (!repo) throw new Error(`Repo not found: ${repoId}`);

  const { data: pulls } = await octokit.rest.pulls.list({
    owner: repo.owner,
    repo: repo.name,
    state: "all",
    sort: "updated",
    direction: "desc",
    per_page: 50,
  });

  for (const pr of pulls) {
    const prAny = pr as Record<string, unknown>;
    const linesAdded = (prAny.additions as number) ?? 0;
    const linesDeleted = (prAny.deletions as number) ?? 0;
    const linesChanged = linesAdded + linesDeleted;
    const size = classifyPRSize(linesChanged);
    const id = `${repoId}#${pr.number}`;

    let reviewStatus = "Pending";
    if (pr.merged_at) {
      reviewStatus = "Merged";
    }

    await execute(
      db,
      `INSERT INTO prs (id, repo_id, number, title, author, author_avatar, branch, size, lines_added, lines_deleted, files_changed, review_status, state, github_created_at, github_updated_at, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, current_timestamp)
       ON CONFLICT (repo_id, number) DO UPDATE SET
         title = excluded.title,
         size = excluded.size,
         lines_added = excluded.lines_added,
         lines_deleted = excluded.lines_deleted,
         files_changed = excluded.files_changed,
         review_status = excluded.review_status,
         state = excluded.state,
         github_updated_at = excluded.github_updated_at,
         fetched_at = current_timestamp`,
      [
        id,
        repoId,
        pr.number,
        pr.title,
        pr.user?.login ?? "unknown",
        pr.user?.avatar_url ?? null,
        pr.head?.ref ?? null,
        size,
        linesAdded,
        linesDeleted,
        (prAny.changed_files as number) ?? 0,
        reviewStatus,
        pr.state,
        pr.created_at,
        pr.updated_at,
      ],
    );
  }

  // Update last_synced_at
  await execute(db, "UPDATE repos SET last_synced_at = current_timestamp WHERE id = ?", [repoId]);

  return pulls.length;
}

export async function syncPRReviews(repoId: string, prNumber: number) {
  const octokit = getOctokit();
  const db = await getDb();

  const repo = await queryOne<{ owner: string; name: string }>(db, "SELECT owner, name FROM repos WHERE id = ?", [
    repoId,
  ]);
  if (!repo) throw new Error(`Repo not found: ${repoId}`);

  // Fetch review statuses
  const { data: reviews } = await octokit.rest.pulls.listReviews({
    owner: repo.owner,
    repo: repo.name,
    pull_number: prNumber,
  });

  // Determine overall review status
  let reviewStatus = "Pending";
  const latestReviews = new Map<string, string>();
  for (const review of reviews) {
    if (review.state === "APPROVED" || review.state === "CHANGES_REQUESTED") {
      latestReviews.set(review.user?.login ?? "", review.state);
    }
  }

  const states = [...latestReviews.values()];
  if (states.includes("CHANGES_REQUESTED")) {
    reviewStatus = "Changes Requested";
  } else if (states.includes("APPROVED")) {
    reviewStatus = "Approved";
  }

  const prId = `${repoId}#${prNumber}`;
  await execute(db, "UPDATE prs SET review_status = ? WHERE id = ?", [reviewStatus, prId]);

  return reviewStatus;
}

export async function syncPRComments(repoId: string, prNumber: number) {
  const octokit = getOctokit();
  const db = await getDb();

  const repo = await queryOne<{ owner: string; name: string }>(db, "SELECT owner, name FROM repos WHERE id = ?", [
    repoId,
  ]);
  if (!repo) throw new Error(`Repo not found: ${repoId}`);

  const prId = `${repoId}#${prNumber}`;

  // Fetch review comments (inline code comments)
  const { data: comments } = await octokit.rest.pulls.listReviewComments({
    owner: repo.owner,
    repo: repo.name,
    pull_number: prNumber,
    per_page: 100,
  });

  for (const comment of comments) {
    const id = `comment-${comment.id}`;
    await execute(
      db,
      `INSERT INTO pr_comments (id, pr_id, github_id, reviewer, reviewer_avatar, body, file_path, line_number, created_at, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, current_timestamp)
       ON CONFLICT (id) DO UPDATE SET
         body = excluded.body,
         fetched_at = current_timestamp`,
      [
        id,
        prId,
        comment.id,
        comment.user?.login ?? "unknown",
        comment.user?.avatar_url ?? null,
        comment.body,
        comment.path ?? null,
        comment.line ?? comment.original_line ?? null,
        comment.created_at,
      ],
    );
  }

  return comments.length;
}

export async function fetchPRDiff(owner: string, repo: string, prNumber: number): Promise<string> {
  const octokit = getOctokit();
  const { data } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
    mediaType: { format: "diff" },
  });
  return data as unknown as string;
}

export async function fetchFileContent(owner: string, repo: string, path: string, ref: string): Promise<string | null> {
  try {
    const octokit = getOctokit();
    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path,
      ref,
    });
    if ("content" in data && data.content) {
      return Buffer.from(data.content, "base64").toString("utf-8");
    }
    return null;
  } catch {
    return null;
  }
}

export async function getConnectedRepos() {
  const db = await getDb();
  return queryAll<{
    id: string;
    owner: string;
    name: string;
    full_name: string;
    default_branch: string;
    last_synced_at: string | null;
  }>(db, "SELECT id, owner, name, full_name, default_branch, last_synced_at FROM repos ORDER BY created_at DESC");
}

export async function removeRepo(repoId: string) {
  const db = await getDb();
  // Cascade delete in order
  await execute(
    db,
    "DELETE FROM comment_fixes WHERE comment_id IN (SELECT id FROM pr_comments WHERE pr_id IN (SELECT id FROM prs WHERE repo_id = ?))",
    [repoId],
  );
  await execute(
    db,
    "DELETE FROM skill_comments WHERE skill_id IN (SELECT id FROM skills WHERE analysis_id IN (SELECT id FROM skill_analyses WHERE repo_id = ?))",
    [repoId],
  );
  await execute(db, "DELETE FROM skills WHERE analysis_id IN (SELECT id FROM skill_analyses WHERE repo_id = ?)", [
    repoId,
  ]);
  await execute(db, "DELETE FROM skill_analyses WHERE repo_id = ?", [repoId]);
  await execute(db, "DELETE FROM split_plans WHERE pr_id IN (SELECT id FROM prs WHERE repo_id = ?)", [repoId]);
  await execute(db, "DELETE FROM pr_comments WHERE pr_id IN (SELECT id FROM prs WHERE repo_id = ?)", [repoId]);
  await execute(db, "DELETE FROM prs WHERE repo_id = ?", [repoId]);
  await execute(db, "DELETE FROM repos WHERE id = ?", [repoId]);
}
