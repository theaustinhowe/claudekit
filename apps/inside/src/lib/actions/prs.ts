"use server";

import { getDb, queryAll, queryOne } from "@/lib/db";
import type { DashboardStats, PR, PRWithComments } from "@/lib/types";

async function getFeedbackCategories(db: Awaited<ReturnType<typeof getDb>>, prId: string): Promise<string[]> {
  const rows = await queryAll<{ category: string }>(
    db,
    "SELECT DISTINCT category FROM pr_comments WHERE pr_id = ? AND category IS NOT NULL",
    [prId],
  );
  return rows.map((r) => r.category);
}

export async function getRecentPRs(repoId: string): Promise<PRWithComments[]> {
  const db = await getDb();
  const prs = await queryAll<PR & { comment_count: number }>(
    db,
    `SELECT p.*,
       (SELECT COUNT(*) FROM pr_comments c WHERE c.pr_id = p.id) as comment_count
     FROM prs p
     WHERE p.repo_id = ?
     ORDER BY p.github_updated_at DESC NULLS LAST
     LIMIT 50`,
    [repoId],
  );

  const results: PRWithComments[] = [];
  for (const pr of prs) {
    const categories = await getFeedbackCategories(db, pr.id);
    results.push({
      ...pr,
      commentCount: Number(pr.comment_count),
      feedbackCategories: categories,
    });
  }
  return results;
}

export async function getDashboardStats(repoId: string): Promise<DashboardStats> {
  const db = await getDb();

  const total = await queryOne<{ count: number }>(db, "SELECT COUNT(*) as count FROM prs WHERE repo_id = ?", [repoId]);

  const avg = await queryOne<{ avg_lines: number }>(
    db,
    "SELECT COALESCE(AVG(lines_added + lines_deleted), 0) as avg_lines FROM prs WHERE repo_id = ?",
    [repoId],
  );

  const splittable = await queryOne<{ count: number }>(
    db,
    "SELECT COUNT(*) as count FROM prs WHERE repo_id = ? AND size IN ('L', 'XL') AND state = 'open'",
    [repoId],
  );

  // Find the most frequent unaddressed skill gap
  const topSkill = await queryOne<{ name: string }>(
    db,
    `SELECT s.name FROM skills s
     JOIN skill_analyses sa ON s.analysis_id = sa.id
     WHERE sa.repo_id = ? AND s.addressed = false
     ORDER BY s.frequency DESC LIMIT 1`,
    [repoId],
  );

  return {
    totalPRs: Number(total?.count ?? 0),
    avgLinesChanged: Math.round(Number(avg?.avg_lines ?? 0)),
    topSkillGap: topSkill?.name ?? null,
    splittablePRs: Number(splittable?.count ?? 0),
  };
}

export async function getPRsWithComments(repoId: string): Promise<PRWithComments[]> {
  const db = await getDb();
  const prs = await queryAll<PR & { comment_count: number }>(
    db,
    `SELECT p.*,
       (SELECT COUNT(*) FROM pr_comments c WHERE c.pr_id = p.id) as comment_count
     FROM prs p
     WHERE p.repo_id = ? AND (SELECT COUNT(*) FROM pr_comments c WHERE c.pr_id = p.id) > 0
     ORDER BY comment_count DESC`,
    [repoId],
  );

  const results: PRWithComments[] = [];
  for (const pr of prs) {
    const categories = await getFeedbackCategories(db, pr.id);
    results.push({
      ...pr,
      commentCount: Number(pr.comment_count),
      feedbackCategories: categories,
    });
  }
  return results;
}

export async function getLargePRs(repoId: string): Promise<PRWithComments[]> {
  const db = await getDb();
  const prs = await queryAll<PR & { comment_count: number }>(
    db,
    `SELECT p.*,
       (SELECT COUNT(*) FROM pr_comments c WHERE c.pr_id = p.id) as comment_count
     FROM prs p
     WHERE p.repo_id = ? AND p.size IN ('L', 'XL')
     ORDER BY (p.lines_added + p.lines_deleted) DESC`,
    [repoId],
  );

  return prs.map((pr) => ({
    ...pr,
    commentCount: Number(pr.comment_count),
    feedbackCategories: [],
  }));
}

export async function getWeeklyPRCounts(repoId: string): Promise<number[]> {
  const db = await getDb();
  const rows = await queryAll<{ count: number }>(
    db,
    `SELECT COUNT(*) as count
     FROM prs
     WHERE repo_id = ?
     GROUP BY DATE_TRUNC('week', github_created_at::TIMESTAMP)
     ORDER BY DATE_TRUNC('week', github_created_at::TIMESTAMP) DESC
     LIMIT 10`,
    [repoId],
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
