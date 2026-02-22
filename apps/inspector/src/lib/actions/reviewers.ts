"use server";

import { getDb, queryAll } from "@/lib/db";
import type { ReviewerComment, ReviewerStats } from "@/lib/types";

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

export async function getReviewerComments(repoId: string, reviewer: string): Promise<ReviewerComment[]> {
  const db = await getDb();
  return queryAll<ReviewerComment>(
    db,
    `SELECT
       c.id,
       c.body,
       c.file_path as filePath,
       c.line_number as lineNumber,
       c.severity,
       c.category,
       c.created_at as createdAt,
       p.number as prNumber,
       p.title as prTitle
     FROM pr_comments c
     JOIN prs p ON c.pr_id = p.id
     WHERE p.repo_id = ? AND c.reviewer = ?
     ORDER BY c.created_at DESC`,
    [repoId, reviewer],
  );
}

export async function getReviewerFileStats(
  repoId: string,
  reviewer: string,
): Promise<{ filePath: string; count: number }[]> {
  const db = await getDb();
  return queryAll<{ filePath: string; count: number }>(
    db,
    `SELECT c.file_path as filePath, COUNT(*) as count
     FROM pr_comments c
     JOIN prs p ON c.pr_id = p.id
     WHERE p.repo_id = ? AND c.reviewer = ? AND c.file_path IS NOT NULL
     GROUP BY c.file_path
     ORDER BY count DESC
     LIMIT 10`,
    [repoId, reviewer],
  );
}
