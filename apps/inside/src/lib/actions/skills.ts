"use server";

import crypto from "node:crypto";
import { runClaude } from "@devkit/claude-runner";
import { execute, getDb, queryAll, queryOne } from "@/lib/db";
import { buildSkillAnalysisPrompt } from "@/lib/prompts";
import type { Skill, SkillWithComments } from "@/lib/types";

export async function startSkillAnalysis(repoId: string, prNumbers: number[]) {
  const db = await getDb();
  const analysisId = crypto.randomUUID();

  // Gather comments for selected PRs
  const prIds = prNumbers.map((n) => `${repoId}#${n}`);
  const placeholders = prIds.map(() => "?").join(",");

  const comments = await queryAll<{
    id: string;
    reviewer: string;
    body: string;
    file_path: string | null;
    line_number: number | null;
    pr_id: string;
  }>(
    db,
    `SELECT id, reviewer, body, file_path, line_number, pr_id FROM pr_comments WHERE pr_id IN (${placeholders})`,
    prIds,
  );

  if (comments.length === 0) {
    throw new Error("No comments found for selected PRs");
  }

  // Get PR titles for context
  const prs = await queryAll<{ id: string; number: number; title: string }>(
    db,
    `SELECT id, number, title FROM prs WHERE id IN (${placeholders})`,
    prIds,
  );
  const prMap = new Map(prs.map((p) => [p.id, p]));

  const enrichedComments = comments.map((c) => {
    const pr = prMap.get(c.pr_id);
    return {
      id: c.id,
      reviewer: c.reviewer,
      body: c.body,
      filePath: c.file_path,
      lineNumber: c.line_number,
      prNumber: pr?.number ?? 0,
      prTitle: pr?.title ?? "",
    };
  });

  const prompt = buildSkillAnalysisPrompt(enrichedComments);

  // Call Claude
  const result = await runClaude({
    prompt,
    cwd: process.cwd(),
    allowedTools: "",
    onProgress: () => {},
  });

  // Parse JSON from Claude's response
  const responseText = result.stdout || "";
  const jsonMatch = responseText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error("Failed to parse skill analysis response");
  }

  const skillsData = JSON.parse(jsonMatch[0]) as Array<{
    name: string;
    severity: string;
    frequency: number;
    trend: string;
    topExample: string;
    description: string;
    commentIds: string[];
    resources: { title: string; url: string }[];
    actionItem: string;
  }>;

  // Persist analysis
  await execute(
    db,
    "INSERT INTO skill_analyses (id, repo_id, pr_numbers, created_at) VALUES (?, ?, ?, current_timestamp)",
    [analysisId, repoId, JSON.stringify(prNumbers)],
  );

  for (const skill of skillsData) {
    const skillId = crypto.randomUUID();
    await execute(
      db,
      `INSERT INTO skills (id, analysis_id, name, frequency, total_prs, trend, severity, top_example, description, resources, action_item, addressed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, false)`,
      [
        skillId,
        analysisId,
        skill.name,
        skill.frequency,
        prNumbers.length,
        skill.trend,
        skill.severity,
        skill.topExample,
        skill.description,
        JSON.stringify(skill.resources),
        skill.actionItem,
      ],
    );

    // Link comments to skill
    for (const commentId of skill.commentIds || []) {
      const linkId = crypto.randomUUID();
      // Only link if the comment exists
      const exists = await queryOne(db, "SELECT 1 FROM pr_comments WHERE id = ?", [commentId]);
      if (exists) {
        await execute(db, "INSERT INTO skill_comments (id, skill_id, comment_id) VALUES (?, ?, ?)", [
          linkId,
          skillId,
          commentId,
        ]);
      }
    }
  }

  return analysisId;
}

export async function getSkillAnalyses(repoId: string) {
  const db = await getDb();
  return queryAll<{ id: string; pr_numbers: string; created_at: string }>(
    db,
    "SELECT id, pr_numbers, created_at FROM skill_analyses WHERE repo_id = ? ORDER BY created_at DESC",
    [repoId],
  );
}

export async function getSkillsForAnalysis(analysisId: string): Promise<SkillWithComments[]> {
  const db = await getDb();
  const skills = await queryAll<Skill>(db, "SELECT * FROM skills WHERE analysis_id = ? ORDER BY frequency DESC", [
    analysisId,
  ]);

  const result: SkillWithComments[] = [];
  for (const skill of skills) {
    const comments = await queryAll<{
      id: string;
      body: string;
      reviewer: string;
      reviewer_avatar: string | null;
      file_path: string | null;
      line_number: number | null;
      pr_number: number;
      pr_title: string;
    }>(
      db,
      `SELECT c.id, c.body, c.reviewer, c.reviewer_avatar, c.file_path, c.line_number, p.number as pr_number, p.title as pr_title
       FROM skill_comments sc
       JOIN pr_comments c ON sc.comment_id = c.id
       JOIN prs p ON c.pr_id = p.id
       WHERE sc.skill_id = ?`,
      [skill.id],
    );

    result.push({
      ...skill,
      comments: comments.map((c) => ({
        id: c.id,
        prNumber: c.pr_number,
        prTitle: c.pr_title,
        reviewer: c.reviewer,
        reviewerAvatar: c.reviewer_avatar,
        text: c.body,
        file: c.file_path,
        line: c.line_number,
      })),
    });
  }

  return result;
}

export async function markSkillAddressed(skillId: string, addressed: boolean) {
  const db = await getDb();
  await execute(db, "UPDATE skills SET addressed = ? WHERE id = ?", [addressed, skillId]);
}
