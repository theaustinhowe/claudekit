"use server";

import { getDb, queryAll, queryOne } from "@/lib/db";
import type { DashboardStats, PR, PRSize, PRWithComments, UserRelationship } from "@/lib/types";

/** Map a snake_case DB row from `prs` to the camelCase PR interface. */
function mapPR(row: Record<string, unknown>): PR {
  return {
    id: row.id as string,
    repoId: row.repo_id as string,
    number: Number(row.number),
    title: row.title as string,
    author: row.author as string,
    authorAvatar: (row.author_avatar as string) ?? null,
    branch: (row.branch as string) ?? null,
    size: row.size as PRSize,
    linesAdded: Number(row.lines_added ?? 0),
    linesDeleted: Number(row.lines_deleted ?? 0),
    filesChanged: Number(row.files_changed ?? 0),
    reviewStatus: (row.review_status as string) ?? null,
    state: row.state as string,
    complexity: row.complexity != null ? Number(row.complexity) : null,
    githubCreatedAt: (row.github_created_at as string) ?? null,
    githubUpdatedAt: (row.github_updated_at as string) ?? null,
    fetchedAt: row.fetched_at as string,
    userRelationship: (row.user_relationship as UserRelationship) ?? null,
    htmlUrl: (row.html_url as string) ?? null,
    repoFullName: (row.repo_full_name as string) ?? null,
  };
}

async function getFeedbackCategories(db: Awaited<ReturnType<typeof getDb>>, prId: string): Promise<string[]> {
  const rows = await queryAll<{ category: string }>(
    db,
    "SELECT DISTINCT category FROM pr_comments WHERE pr_id = ? AND category IS NOT NULL",
    [prId],
  );
  return rows.map((r) => r.category);
}

export async function getRecentPRs(repoId?: string): Promise<PRWithComments[]> {
  const db = await getDb();
  const whereClause = repoId ? "WHERE p.repo_id = ?" : "";
  const params = repoId ? [repoId] : [];

  const prs = await queryAll<Record<string, unknown>>(
    db,
    `SELECT p.*,
       (SELECT COUNT(*) FROM pr_comments c WHERE c.pr_id = p.id) as comment_count
     FROM prs p
     ${whereClause}
     ORDER BY p.github_updated_at DESC NULLS LAST
     LIMIT 50`,
    params,
  );

  const results: PRWithComments[] = [];
  for (const row of prs) {
    const pr = mapPR(row);
    const categories = await getFeedbackCategories(db, pr.id);
    results.push({
      ...pr,
      commentCount: Number(row.comment_count ?? 0),
      feedbackCategories: categories,
    });
  }
  return results;
}

export async function getDashboardStats(repoId?: string): Promise<DashboardStats> {
  const db = await getDb();
  const repoFilter = repoId ? "WHERE repo_id = ?" : "";
  const repoParams = repoId ? [repoId] : [];

  const total = await queryOne<{ count: number }>(db, `SELECT COUNT(*) as count FROM prs ${repoFilter}`, repoParams);

  const avg = await queryOne<{ avg_lines: number }>(
    db,
    `SELECT COALESCE(AVG(lines_added + lines_deleted), 0) as avg_lines FROM prs ${repoFilter}`,
    repoParams,
  );

  const splittable = await queryOne<{ count: number }>(
    db,
    `SELECT COUNT(*) as count FROM prs WHERE size IN ('L', 'XL') AND state = 'open'${repoId ? " AND repo_id = ?" : ""}`,
    repoParams,
  );

  // Find the most frequent unaddressed skill gap
  const topSkill = repoId
    ? await queryOne<{ name: string }>(
        db,
        `SELECT s.name FROM skills s
         JOIN skill_analyses sa ON s.analysis_id = sa.id
         WHERE sa.repo_id = ? AND s.addressed = false
         ORDER BY s.frequency DESC LIMIT 1`,
        [repoId],
      )
    : await queryOne<{ name: string }>(
        db,
        `SELECT s.name FROM skills s
         WHERE s.addressed = false
         ORDER BY s.frequency DESC LIMIT 1`,
      );

  return {
    totalPRs: Number(total?.count ?? 0),
    avgLinesChanged: Math.round(Number(avg?.avg_lines ?? 0)),
    topSkillGap: topSkill?.name ?? null,
    splittablePRs: Number(splittable?.count ?? 0),
  };
}

export async function getPRsWithComments(repoId?: string): Promise<PRWithComments[]> {
  const db = await getDb();
  const whereClause = repoId
    ? "WHERE p.repo_id = ? AND (SELECT COUNT(*) FROM pr_comments c WHERE c.pr_id = p.id) > 0"
    : "WHERE (SELECT COUNT(*) FROM pr_comments c WHERE c.pr_id = p.id) > 0";
  const params = repoId ? [repoId] : [];

  const prs = await queryAll<Record<string, unknown>>(
    db,
    `SELECT p.*,
       (SELECT COUNT(*) FROM pr_comments c WHERE c.pr_id = p.id) as comment_count
     FROM prs p
     ${whereClause}
     ORDER BY comment_count DESC`,
    params,
  );

  const results: PRWithComments[] = [];
  for (const row of prs) {
    const pr = mapPR(row);
    const categories = await getFeedbackCategories(db, pr.id);
    results.push({
      ...pr,
      commentCount: Number(row.comment_count ?? 0),
      feedbackCategories: categories,
    });
  }
  return results;
}

export async function getLargePRs(repoId?: string): Promise<PRWithComments[]> {
  const db = await getDb();
  const whereClause = repoId
    ? "WHERE p.repo_id = ? AND (p.size IN ('L', 'XL') OR (p.lines_added + p.lines_deleted) >= 500)"
    : "WHERE p.size IN ('L', 'XL') OR (p.lines_added + p.lines_deleted) >= 500";
  const params = repoId ? [repoId] : [];

  const prs = await queryAll<Record<string, unknown>>(
    db,
    `SELECT p.*,
       (SELECT COUNT(*) FROM pr_comments c WHERE c.pr_id = p.id) as comment_count
     FROM prs p
     ${whereClause}
     ORDER BY (p.lines_added + p.lines_deleted) DESC`,
    params,
  );

  return prs.map((row) => ({
    ...mapPR(row),
    commentCount: Number(row.comment_count ?? 0),
    feedbackCategories: [],
  }));
}

export async function getWeeklyPRCounts(repoId?: string): Promise<number[]> {
  const db = await getDb();
  const whereClause = repoId ? "WHERE repo_id = ?" : "";
  const params = repoId ? [repoId] : [];

  const rows = await queryAll<{ count: number }>(
    db,
    `SELECT COUNT(*) as count
     FROM prs
     ${whereClause}
     GROUP BY DATE_TRUNC('week', github_created_at::TIMESTAMP)
     ORDER BY DATE_TRUNC('week', github_created_at::TIMESTAMP) DESC
     LIMIT 10`,
    params,
  );
  // Reverse so most recent is last (for sparkline rendering)
  return rows.map((r) => Number(r.count)).reverse();
}

export async function getPRComments(prId: string) {
  const db = await getDb();
  return queryAll<{
    id: string;
    pr_id: string;
    reviewer: string;
    reviewer_avatar: string | null;
    body: string;
    file_path: string | null;
    line_number: number | null;
    severity: string | null;
    category: string | null;
    created_at: string | null;
  }>(db, "SELECT * FROM pr_comments WHERE pr_id = ? ORDER BY created_at ASC", [prId]);
}
