"use server";

import { getSetting } from "@/lib/actions/settings";
import { classifyComment } from "@/lib/comment-classifier";
import { classifyPRSize } from "@/lib/constants";
import { execute, getDb, queryAll, queryOne } from "@/lib/db";
import { getOctokit } from "@/lib/github";
import { createServiceLogger } from "@/lib/logger";

const log = createServiceLogger("github");

export async function syncRepo(owner: string, name: string) {
  log.info({ owner, name }, "Syncing repo");
  const octokit = getOctokit();
  const { data: repo } = await octokit.rest.repos.get({ owner, repo: name });

  const db = await getDb();
  const id = `${owner}/${name}`;

  await execute(
    db,
    `INSERT INTO repos (id, owner, name, full_name, default_branch, last_synced_at, created_at)
     VALUES (?, ?, ?, ?, ?, now(), now())
     ON CONFLICT (id) DO UPDATE SET
       default_branch = excluded.default_branch,
       last_synced_at = now()`,
    [id, owner, name, repo.full_name, repo.default_branch || "main"],
  );

  log.info({ repoId: id }, "Repo synced");
  return { id, fullName: repo.full_name, defaultBranch: repo.default_branch || "main" };
}

export async function syncPRs(repoId: string) {
  const octokit = getOctokit();
  const db = await getDb();

  const repo = await queryOne<{ owner: string; name: string; last_synced_at: string | null }>(
    db,
    "SELECT owner, name, last_synced_at FROM repos WHERE id = ?",
    [repoId],
  );
  if (!repo) throw new Error(`Repo not found: ${repoId}`);

  const maxPRsSetting = await getSetting("max_sync_prs");
  const maxPRs = maxPRsSetting ? Number.parseInt(maxPRsSetting, 10) : 200;

  // Use pagination to fetch all PRs up to maxPRs
  const pulls = await octokit.paginate(octokit.rest.pulls.list, {
    owner: repo.owner,
    repo: repo.name,
    state: "all",
    sort: "updated",
    direction: "desc",
    per_page: 100,
    ...(repo.last_synced_at ? { since: repo.last_synced_at } : {}),
  });

  const limitedPulls = pulls.slice(0, maxPRs);
  log.info({ repoId, fetched: pulls.length, processing: limitedPulls.length }, "Paginated PR fetch complete");

  for (const pr of limitedPulls) {
    const prAny = pr as Record<string, unknown>;
    const linesAdded = (prAny.additions as number) ?? 0;
    const linesDeleted = (prAny.deletions as number) ?? 0;
    const linesChanged = linesAdded + linesDeleted;
    const size = classifyPRSize(linesChanged);
    const id = `${repoId}#${pr.number}`;

    let reviewStatus = "Pending";
    if (pr.state === "closed" && pr.merged_at) {
      reviewStatus = "Merged";
    } else if (pr.draft) {
      reviewStatus = "Draft";
    }

    await execute(
      db,
      `INSERT INTO prs (id, repo_id, number, title, author, author_avatar, branch, size, lines_added, lines_deleted, files_changed, review_status, state, github_created_at, github_updated_at, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, now())
       ON CONFLICT (repo_id, number) DO UPDATE SET
         title = excluded.title,
         size = excluded.size,
         lines_added = excluded.lines_added,
         lines_deleted = excluded.lines_deleted,
         files_changed = excluded.files_changed,
         review_status = excluded.review_status,
         state = excluded.state,
         github_updated_at = excluded.github_updated_at,
         fetched_at = now()`,
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
  await execute(db, "UPDATE repos SET last_synced_at = now() WHERE id = ?", [repoId]);

  log.info({ repoId, count: limitedPulls.length }, "PRs synced");
  return limitedPulls.length;
}

async function syncPRReviews(repoId: string, prNumber: number) {
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

  // Check last comment fetch time for incremental sync
  const lastFetch = await queryOne<{ last_fetched: string }>(
    db,
    "SELECT MAX(fetched_at) as last_fetched FROM pr_comments WHERE pr_id = ?",
    [prId],
  );

  // Fetch review comments, incrementally if we have prior data
  const comments = await octokit.paginate(octokit.rest.pulls.listReviewComments, {
    owner: repo.owner,
    repo: repo.name,
    pull_number: prNumber,
    per_page: 100,
    ...(lastFetch?.last_fetched ? { since: lastFetch.last_fetched } : {}),
  });

  for (const comment of comments) {
    const id = `comment-${comment.id}`;
    const { severity, category } = classifyComment(comment.body);
    await execute(
      db,
      `INSERT INTO pr_comments (id, pr_id, github_id, reviewer, reviewer_avatar, body, file_path, line_number, severity, category, created_at, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, now())
       ON CONFLICT (id) DO UPDATE SET
         body = excluded.body,
         severity = COALESCE(pr_comments.severity, excluded.severity),
         category = COALESCE(pr_comments.category, excluded.category),
         fetched_at = now()`,
      [
        id,
        prId,
        comment.id,
        comment.user?.login ?? "unknown",
        comment.user?.avatar_url ?? null,
        comment.body,
        comment.path ?? null,
        comment.line ?? comment.original_line ?? null,
        severity,
        category,
        comment.created_at,
      ],
    );
  }

  log.info({ repoId, prNumber, count: comments.length }, "PR comments synced");
  return comments.length;
}

export async function syncAllCommentsForRepo(repoId: string) {
  const db = await getDb();
  const prs = await queryAll<{ number: number }>(db, "SELECT number FROM prs WHERE repo_id = ?", [repoId]);

  log.info({ repoId, prCount: prs.length }, "Syncing all comments for repo");
  let totalComments = 0;
  for (const pr of prs) {
    const commentCount = await syncPRComments(repoId, pr.number);
    await syncPRReviews(repoId, pr.number);
    totalComments += commentCount;
  }
  log.info({ repoId, totalComments }, "All comments synced");
  return totalComments;
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
  log.info({ repoId }, "Removing repo and all associated data");
  const db = await getDb();
  // Cascade delete in order
  await execute(
    db,
    "DELETE FROM comment_fixes WHERE comment_id IN (SELECT id FROM pr_comments WHERE pr_id IN (SELECT id FROM prs WHERE repo_id = ?))",
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
