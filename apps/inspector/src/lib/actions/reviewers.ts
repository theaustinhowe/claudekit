"use server";

import { getDb, queryAll, queryOne } from "@/lib/db";
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

export async function getUserReviewStats(repoId?: string): Promise<{
  totalPRsAuthored: number;
  totalPRsReviewed: number;
  totalCommentsReceived: number;
  totalCommentsGiven: number;
  topReviewers: { reviewer: string; avatar: string | null; count: number }[];
  topCommentedFiles: { filePath: string; count: number }[];
  severityDistribution: Record<string, number>;
  categoryDistribution: Record<string, number>;
  weeklyActivity: { week: string; authored: number; reviewed: number; comments: number }[];
}> {
  const db = await getDb();
  const repoFilter = repoId ? "AND p.repo_id = ?" : "";
  const repoParams = repoId ? [repoId] : [];

  // Total PRs authored (from prs where user_relationship = 'authored', or all)
  const authored = await queryOne<{ count: number }>(
    db,
    `SELECT COUNT(*) as count FROM prs p WHERE p.user_relationship = 'authored' ${repoFilter}`,
    repoParams,
  );

  const reviewed = await queryOne<{ count: number }>(
    db,
    `SELECT COUNT(*) as count FROM prs p WHERE p.user_relationship = 'reviewed' ${repoFilter}`,
    repoParams,
  );

  // Comments received (on PRs I authored)
  const received = await queryOne<{ count: number }>(
    db,
    `SELECT COUNT(*) as count FROM pr_comments c
     JOIN prs p ON c.pr_id = p.id
     WHERE p.user_relationship = 'authored' ${repoFilter}`,
    repoParams,
  );

  // Comments given (on PRs I reviewed)
  const given = await queryOne<{ count: number }>(
    db,
    `SELECT COUNT(*) as count FROM pr_comments c
     JOIN prs p ON c.pr_id = p.id
     WHERE p.user_relationship = 'reviewed' ${repoFilter}`,
    repoParams,
  );

  // Top reviewers (who reviews my PRs most)
  const topReviewers = await queryAll<{ reviewer: string; avatar: string | null; count: number }>(
    db,
    `SELECT c.reviewer, c.reviewer_avatar as avatar, COUNT(*) as count
     FROM pr_comments c
     JOIN prs p ON c.pr_id = p.id
     WHERE p.user_relationship = 'authored' ${repoFilter}
     GROUP BY c.reviewer, c.reviewer_avatar
     ORDER BY count DESC
     LIMIT 10`,
    repoParams,
  );

  // Top commented files
  const topFiles = await queryAll<{ filePath: string; count: number }>(
    db,
    `SELECT c.file_path as filePath, COUNT(*) as count
     FROM pr_comments c
     JOIN prs p ON c.pr_id = p.id
     WHERE c.file_path IS NOT NULL ${repoFilter}
     GROUP BY c.file_path
     ORDER BY count DESC
     LIMIT 10`,
    repoParams,
  );

  // Severity distribution
  const severities = await queryAll<{ severity: string; count: number }>(
    db,
    `SELECT COALESCE(c.severity, 'unknown') as severity, COUNT(*) as count
     FROM pr_comments c
     JOIN prs p ON c.pr_id = p.id
     WHERE 1=1 ${repoFilter}
     GROUP BY c.severity`,
    repoParams,
  );

  // Category distribution
  const categories = await queryAll<{ category: string; count: number }>(
    db,
    `SELECT COALESCE(c.category, 'General') as category, COUNT(*) as count
     FROM pr_comments c
     JOIN prs p ON c.pr_id = p.id
     WHERE 1=1 ${repoFilter}
     GROUP BY c.category
     ORDER BY count DESC`,
    repoParams,
  );

  // Weekly activity (last 12 weeks)
  const weeklyAuthored = await queryAll<{ week: string; count: number }>(
    db,
    `SELECT DATE_TRUNC('week', p.github_created_at::TIMESTAMP)::TEXT as week, COUNT(*) as count
     FROM prs p
     WHERE p.user_relationship = 'authored' AND p.github_created_at IS NOT NULL ${repoFilter}
     GROUP BY week ORDER BY week DESC LIMIT 12`,
    repoParams,
  );

  const weeklyReviewed = await queryAll<{ week: string; count: number }>(
    db,
    `SELECT DATE_TRUNC('week', p.github_created_at::TIMESTAMP)::TEXT as week, COUNT(*) as count
     FROM prs p
     WHERE p.user_relationship = 'reviewed' AND p.github_created_at IS NOT NULL ${repoFilter}
     GROUP BY week ORDER BY week DESC LIMIT 12`,
    repoParams,
  );

  const weeklyComments = await queryAll<{ week: string; count: number }>(
    db,
    `SELECT DATE_TRUNC('week', c.created_at::TIMESTAMP)::TEXT as week, COUNT(*) as count
     FROM pr_comments c
     JOIN prs p ON c.pr_id = p.id
     WHERE c.created_at IS NOT NULL ${repoFilter}
     GROUP BY week ORDER BY week DESC LIMIT 12`,
    repoParams,
  );

  // Merge weekly data
  const allWeeks = new Set<string>();
  for (const w of [...weeklyAuthored, ...weeklyReviewed, ...weeklyComments]) {
    if (w.week) allWeeks.add(w.week);
  }
  const authoredMap = new Map(weeklyAuthored.map((w) => [w.week, Number(w.count)]));
  const reviewedMap = new Map(weeklyReviewed.map((w) => [w.week, Number(w.count)]));
  const commentsMap = new Map(weeklyComments.map((w) => [w.week, Number(w.count)]));

  const weeklyActivity = [...allWeeks]
    .sort()
    .slice(-12)
    .map((week) => ({
      week,
      authored: authoredMap.get(week) ?? 0,
      reviewed: reviewedMap.get(week) ?? 0,
      comments: commentsMap.get(week) ?? 0,
    }));

  return {
    totalPRsAuthored: Number(authored?.count ?? 0),
    totalPRsReviewed: Number(reviewed?.count ?? 0),
    totalCommentsReceived: Number(received?.count ?? 0),
    totalCommentsGiven: Number(given?.count ?? 0),
    topReviewers: topReviewers.map((r) => ({ ...r, count: Number(r.count) })),
    topCommentedFiles: topFiles.map((f) => ({ ...f, count: Number(f.count) })),
    severityDistribution: Object.fromEntries(severities.map((s) => [s.severity, Number(s.count)])),
    categoryDistribution: Object.fromEntries(categories.map((c) => [c.category, Number(c.count)])),
    weeklyActivity,
  };
}
