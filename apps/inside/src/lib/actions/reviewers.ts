"use server";

import { getDb, queryAll } from "@/lib/db";
import type { ReviewerStats } from "@/lib/types";

export async function getReviewerStats(repoId: string): Promise<ReviewerStats[]> {
  const db = await getDb();

  const reviewers = await queryAll<{
    reviewer: string;
    reviewer_avatar: string | null;
    total_comments: number;
    prs_reviewed: number;
  }>(
    db,
    `SELECT
       c.reviewer,
       c.reviewer_avatar,
       COUNT(*) as total_comments,
       COUNT(DISTINCT c.pr_id) as prs_reviewed
     FROM pr_comments c
     JOIN prs p ON c.pr_id = p.id
     WHERE p.repo_id = ?
     GROUP BY c.reviewer, c.reviewer_avatar
     ORDER BY total_comments DESC`,
    [repoId],
  );

  const result: ReviewerStats[] = [];

  for (const r of reviewers) {
    const severities = await queryAll<{ severity: string; count: number }>(
      db,
      `SELECT COALESCE(c.severity, 'unknown') as severity, COUNT(*) as count
       FROM pr_comments c
       JOIN prs p ON c.pr_id = p.id
       WHERE p.repo_id = ? AND c.reviewer = ?
       GROUP BY c.severity`,
      [repoId, r.reviewer],
    );

    const categories = await queryAll<{ category: string; count: number }>(
      db,
      `SELECT COALESCE(c.category, 'General') as category, COUNT(*) as count
       FROM pr_comments c
       JOIN prs p ON c.pr_id = p.id
       WHERE p.repo_id = ? AND c.reviewer = ?
       GROUP BY c.category
       ORDER BY count DESC
       LIMIT 5`,
      [repoId, r.reviewer],
    );

    result.push({
      reviewer: r.reviewer,
      reviewerAvatar: r.reviewer_avatar,
      totalComments: Number(r.total_comments),
      prsReviewed: Number(r.prs_reviewed),
      severityCounts: Object.fromEntries(severities.map((s) => [s.severity, Number(s.count)])),
      categoryCounts: Object.fromEntries(categories.map((c) => [c.category, Number(c.count)])),
    });
  }

  return result;
}

export async function getReviewerTopComments(repoId: string, reviewer: string) {
  const db = await getDb();
  return queryAll<{
    body: string;
    file_path: string | null;
    severity: string | null;
    category: string | null;
    pr_number: number;
    pr_title: string;
  }>(
    db,
    `SELECT c.body, c.file_path, c.severity, c.category, p.number as pr_number, p.title as pr_title
     FROM pr_comments c
     JOIN prs p ON c.pr_id = p.id
     WHERE p.repo_id = ? AND c.reviewer = ?
     ORDER BY c.created_at DESC
     LIMIT 10`,
    [repoId, reviewer],
  );
}
