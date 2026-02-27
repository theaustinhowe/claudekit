"use server";

import { execute, getDb, queryAll, queryOne } from "@/lib/db";
import { getOctokit, hasValidPATSync } from "@/lib/github";
import { createServiceLogger } from "@/lib/logger";
import { createSession, startSession } from "@/lib/services/session-manager";
import { createAccountSyncRunner } from "@/lib/services/session-runners/account-sync";
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

export async function startAccountSync(): Promise<string> {
  log.info("Starting account sync session");

  const metadata = {};
  const sessionId = await createSession({
    sessionType: "account_sync",
    label: "Account PR sync",
    metadata,
  });

  const runner = createAccountSyncRunner(metadata);
  await startSession(sessionId, runner);

  return sessionId;
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
