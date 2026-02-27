"use server";

import { classifyPRSize } from "@/lib/constants";
import { execute, getDb, queryAll, queryOne } from "@/lib/db";
import { getOctokit, hasValidPATSync } from "@/lib/github";
import { createServiceLogger } from "@/lib/logger";
import type { AccountStats, GitHubUser, PRWithComments, UserRelationship } from "@/lib/types";

const log = createServiceLogger("account");

export async function hasValidPAT(): Promise<boolean> {
  return hasValidPATSync();
}

export async function getAuthenticatedUser(): Promise<GitHubUser | null> {
  if (!hasValidPATSync()) return null;

  const db = await getDb();

  // Check cache first (valid for 1 hour)
  const cached = await queryOne<{
    id: string;
    login: string;
    avatar_url: string | null;
    name: string | null;
    fetched_at: string;
  }>(db, "SELECT * FROM github_user LIMIT 1");

  if (cached) {
    const age = Date.now() - new Date(cached.fetched_at).getTime();
    if (age < 60 * 60 * 1000) {
      return {
        id: cached.id,
        login: cached.login,
        avatarUrl: cached.avatar_url,
        name: cached.name,
      };
    }
  }

  try {
    const octokit = getOctokit();
    const { data: user } = await octokit.rest.users.getAuthenticated();

    await execute(
      db,
      `INSERT INTO github_user (id, login, avatar_url, name, fetched_at)
       VALUES (?, ?, ?, ?, now())
       ON CONFLICT (id) DO UPDATE SET
         login = excluded.login,
         avatar_url = excluded.avatar_url,
         name = excluded.name,
         fetched_at = now()`,
      [String(user.id), user.login, user.avatar_url, user.name],
    );

    return {
      id: String(user.id),
      login: user.login,
      avatarUrl: user.avatar_url,
      name: user.name,
    };
  } catch (err) {
    log.error({ err }, "Failed to fetch authenticated user");
    throw new Error(
      `GitHub authentication failed: ${err instanceof Error ? err.message : "Unknown error"}. Check that your PAT is valid and not expired.`,
    );
  }
}

export async function syncAccountPRs(options?: {
  maxPerQuery?: number;
}): Promise<{ totalSynced: number; reposDiscovered: number }> {
  const user = await getAuthenticatedUser();
  if (!user) throw new Error("No authenticated user — check PAT");

  const octokit = getOctokit();
  const db = await getDb();
  const maxPerQuery = options?.maxPerQuery ?? 100;
  const login = user.login;

  log.info({ login }, "Starting account-wide PR sync");

  const seen = new Map<string, UserRelationship>();
  let reposDiscovered = 0;

  const queries: { q: string; relationship: UserRelationship }[] = [
    { q: `type:pr author:${login}`, relationship: "authored" },
    { q: `type:pr reviewed-by:${login}`, relationship: "reviewed" },
    { q: `type:pr assignee:${login}`, relationship: "assigned" },
  ];

  for (const { q, relationship } of queries) {
    try {
      const results = await octokit.rest.search.issuesAndPullRequests({
        q,
        sort: "updated",
        order: "desc",
        per_page: Math.min(maxPerQuery, 100),
      });

      for (const item of results.data.items) {
        const htmlUrl = item.html_url;
        if (seen.has(htmlUrl)) continue;
        seen.set(htmlUrl, relationship);

        // Extract repo info from URL: https://github.com/{owner}/{name}/pull/{number}
        const urlParts = htmlUrl.replace("https://github.com/", "").split("/");
        const owner = urlParts[0];
        const repoName = urlParts[1];
        const prNumber = item.number;
        const repoFullName = `${owner}/${repoName}`;
        const repoId = repoFullName;

        // Ensure repo exists
        const existingRepo = await queryOne(db, "SELECT id FROM repos WHERE id = ?", [repoId]);
        if (!existingRepo) {
          await execute(
            db,
            `INSERT INTO repos (id, owner, name, full_name, default_branch, created_at)
             VALUES (?, ?, ?, ?, 'main', now())`,
            [repoId, owner, repoName, repoFullName],
          );
          reposDiscovered++;
        }

        const prId = `${repoId}#${prNumber}`;
        const linesAdded = 0; // Search API doesn't return line counts
        const linesDeleted = 0;
        const size = classifyPRSize(0);

        let reviewStatus = "Pending";
        if (item.state === "closed" && item.pull_request?.merged_at) {
          reviewStatus = "Merged";
        } else if (item.draft) {
          reviewStatus = "Draft";
        }

        await execute(
          db,
          `INSERT INTO prs (id, repo_id, number, title, author, author_avatar, branch, size, lines_added, lines_deleted, files_changed, review_status, state, github_created_at, github_updated_at, fetched_at, user_relationship, html_url, repo_full_name)
           VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, 0, ?, ?, ?, ?, now(), ?, ?, ?)
           ON CONFLICT (repo_id, number) DO UPDATE SET
             title = excluded.title,
             review_status = COALESCE(prs.review_status, excluded.review_status),
             state = excluded.state,
             github_updated_at = excluded.github_updated_at,
             user_relationship = COALESCE(excluded.user_relationship, prs.user_relationship),
             html_url = COALESCE(excluded.html_url, prs.html_url),
             repo_full_name = COALESCE(excluded.repo_full_name, prs.repo_full_name),
             fetched_at = now()`,
          [
            prId,
            repoId,
            prNumber,
            item.title,
            item.user?.login ?? "unknown",
            item.user?.avatar_url ?? null,
            size,
            linesAdded,
            linesDeleted,
            reviewStatus,
            item.state,
            item.created_at,
            item.updated_at,
            relationship,
            htmlUrl,
            repoFullName,
          ],
        );
      }

      log.info({ query: q, count: results.data.items.length }, "Search query complete");
    } catch (err) {
      log.warn({ query: q, err }, "Search query failed, continuing...");
    }
  }

  // Enrich PRs that have 0 lines (search API doesn't return line counts)
  // Prioritize open PRs first (most actionable for splitting), then recent closed ones
  const prsToEnrich = await queryAll<{ id: string; repo_id: string; number: number }>(
    db,
    `SELECT id, repo_id, number FROM prs
     WHERE lines_added = 0 AND lines_deleted = 0 AND user_relationship IS NOT NULL
     ORDER BY (CASE WHEN state = 'open' THEN 0 ELSE 1 END), github_updated_at DESC
     LIMIT 200`,
  );

  for (const pr of prsToEnrich) {
    try {
      const repo = await queryOne<{ owner: string; name: string }>(db, "SELECT owner, name FROM repos WHERE id = ?", [
        pr.repo_id,
      ]);
      if (!repo) continue;

      const { data: fullPR } = await octokit.rest.pulls.get({
        owner: repo.owner,
        repo: repo.name,
        pull_number: pr.number,
      });

      const linesAdded = fullPR.additions ?? 0;
      const linesDeleted = fullPR.deletions ?? 0;
      const size = classifyPRSize(linesAdded + linesDeleted);

      await execute(
        db,
        `UPDATE prs SET
           lines_added = ?, lines_deleted = ?, files_changed = ?,
           size = ?, branch = ?, author_avatar = ?
         WHERE id = ?`,
        [
          linesAdded,
          linesDeleted,
          fullPR.changed_files ?? 0,
          size,
          fullPR.head?.ref ?? null,
          fullPR.user?.avatar_url ?? null,
          pr.id,
        ],
      );
    } catch {
      // Skip PRs we can't access
    }
  }

  log.info({ totalSynced: seen.size, reposDiscovered }, "Account PR sync complete");
  return { totalSynced: seen.size, reposDiscovered };
}

export async function getAccountPRs(filters?: {
  relationship?: UserRelationship;
  state?: string;
  size?: string;
  search?: string;
  sort?: "updated" | "created" | "comments";
  limit?: number;
  offset?: number;
}): Promise<PRWithComments[]> {
  const db = await getDb();

  const conditions: string[] = ["p.user_relationship IS NOT NULL"];
  const params: unknown[] = [];

  if (filters?.relationship) {
    conditions.push("p.user_relationship = ?");
    params.push(filters.relationship);
  }
  if (filters?.state) {
    conditions.push("p.state = ?");
    params.push(filters.state);
  }
  if (filters?.size) {
    conditions.push("p.size = ?");
    params.push(filters.size);
  }
  if (filters?.search) {
    conditions.push("(p.title ILIKE ? OR p.author ILIKE ? OR CAST(p.number AS TEXT) LIKE ?)");
    const q = `%${filters.search}%`;
    params.push(q, q, q);
  }

  const orderBy =
    filters?.sort === "created"
      ? "p.github_created_at DESC NULLS LAST"
      : filters?.sort === "comments"
        ? "comment_count DESC"
        : "p.github_updated_at DESC NULLS LAST";

  const limit = filters?.limit ?? 100;
  const offset = filters?.offset ?? 0;

  const prs = await queryAll<{
    id: string;
    repo_id: string;
    number: number;
    title: string;
    author: string;
    author_avatar: string | null;
    branch: string | null;
    size: string;
    lines_added: number;
    lines_deleted: number;
    files_changed: number;
    review_status: string | null;
    state: string;
    complexity: number | null;
    github_created_at: string | null;
    github_updated_at: string | null;
    fetched_at: string;
    user_relationship: string | null;
    html_url: string | null;
    repo_full_name: string | null;
    comment_count: number;
  }>(
    db,
    `SELECT p.*,
       (SELECT COUNT(*) FROM pr_comments c WHERE c.pr_id = p.id) as comment_count
     FROM prs p
     WHERE ${conditions.join(" AND ")}
     ORDER BY ${orderBy}
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );

  return prs.map((pr) => ({
    id: pr.id,
    repoId: pr.repo_id,
    number: pr.number,
    title: pr.title,
    author: pr.author,
    authorAvatar: pr.author_avatar,
    branch: pr.branch,
    size: pr.size as "S" | "M" | "L" | "XL",
    linesAdded: Number(pr.lines_added),
    linesDeleted: Number(pr.lines_deleted),
    filesChanged: Number(pr.files_changed),
    reviewStatus: pr.review_status,
    state: pr.state,
    complexity: pr.complexity,
    githubCreatedAt: pr.github_created_at,
    githubUpdatedAt: pr.github_updated_at,
    fetchedAt: pr.fetched_at,
    userRelationship: pr.user_relationship as UserRelationship | null,
    htmlUrl: pr.html_url,
    repoFullName: pr.repo_full_name,
    commentCount: Number(pr.comment_count),
    feedbackCategories: [],
  }));
}

export async function getAccountStats(): Promise<AccountStats> {
  const db = await getDb();

  const total = await queryOne<{ count: number }>(
    db,
    "SELECT COUNT(*) as count FROM prs WHERE user_relationship IS NOT NULL",
  );

  const repos = await queryOne<{ count: number }>(
    db,
    "SELECT COUNT(DISTINCT repo_id) as count FROM prs WHERE user_relationship IS NOT NULL",
  );

  const comments = await queryOne<{ count: number }>(
    db,
    "SELECT COUNT(*) as count FROM pr_comments WHERE pr_id IN (SELECT id FROM prs WHERE user_relationship IS NOT NULL)",
  );

  const authored = await queryOne<{ count: number }>(
    db,
    "SELECT COUNT(*) as count FROM prs WHERE user_relationship = 'authored'",
  );

  const reviewed = await queryOne<{ count: number }>(
    db,
    "SELECT COUNT(*) as count FROM prs WHERE user_relationship = 'reviewed'",
  );

  const avg = await queryOne<{ avg_lines: number }>(
    db,
    "SELECT COALESCE(AVG(lines_added + lines_deleted), 0) as avg_lines FROM prs WHERE user_relationship IS NOT NULL",
  );

  const splittable = await queryOne<{ count: number }>(
    db,
    "SELECT COUNT(*) as count FROM prs WHERE user_relationship IS NOT NULL AND size IN ('L', 'XL') AND state = 'open'",
  );

  const topSkill = await queryOne<{ name: string }>(
    db,
    `SELECT s.name FROM skills s
     WHERE s.addressed = false
     ORDER BY s.frequency DESC LIMIT 1`,
  );

  return {
    totalPRs: Number(total?.count ?? 0),
    totalRepos: Number(repos?.count ?? 0),
    totalComments: Number(comments?.count ?? 0),
    prsAuthored: Number(authored?.count ?? 0),
    prsReviewed: Number(reviewed?.count ?? 0),
    avgLinesChanged: Math.round(Number(avg?.avg_lines ?? 0)),
    topSkillGap: topSkill?.name ?? null,
    splittablePRs: Number(splittable?.count ?? 0),
  };
}
