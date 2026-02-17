"use server";

import { getDb, queryAll, queryOne } from "@/lib/db";
import type { DashboardStats, PR, PRWithComments } from "@/lib/types";

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

  return prs.map((pr) => ({
    ...pr,
    commentCount: Number(pr.comment_count),
    feedbackCategories: [],
  }));
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

  return {
    totalPRs: Number(total?.count ?? 0),
    avgLinesChanged: Math.round(Number(avg?.avg_lines ?? 0)),
    topSkillGap: null,
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

  return prs.map((pr) => ({
    ...pr,
    commentCount: Number(pr.comment_count),
    feedbackCategories: [],
  }));
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
