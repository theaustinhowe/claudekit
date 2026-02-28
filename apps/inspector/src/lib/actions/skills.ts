"use server";

import { execute, getDb, queryAll, queryOne } from "@/lib/db";
import { createServiceLogger } from "@/lib/logger";
import { createSession, startSession } from "@/lib/services/session-manager";
import { createSkillAnalysisRunner } from "@/lib/services/session-runners/skill-analysis";
import { createSkillRuleAnalysisRunner } from "@/lib/services/session-runners/skill-rule-analysis";
import type { Skill, SkillWithComments } from "@/lib/types";

const log = createServiceLogger("skills");

export async function startSkillAnalysis(repoId: string, prNumbers: number[]): Promise<string> {
  log.info({ repoId, prNumbers }, "Starting skill analysis session");

  const metadata = { repoId, prNumbers };
  const sessionId = await createSession({
    sessionType: "skill_analysis",
    label: `Skill analysis (${prNumbers.length} PRs)`,
    contextType: "repo",
    contextId: repoId,
    metadata,
  });

  const runner = createSkillAnalysisRunner(metadata);
  await startSession(sessionId, runner);

  return sessionId;
}

export async function startSkillRuleAnalysis(repoId: string, prNumbers: number[]): Promise<string> {
  log.info({ repoId, prNumbers }, "Starting skill rule analysis session");

  const metadata = { repoId, prNumbers };
  const sessionId = await createSession({
    sessionType: "skill_rule_analysis",
    label: `Skill rule generation (${prNumbers.length} PRs)`,
    contextType: "repo",
    contextId: repoId,
    metadata,
  });

  const runner = createSkillRuleAnalysisRunner(metadata);
  await startSession(sessionId, runner);

  return sessionId;
}

export async function getAnalysisById(analysisId: string) {
  const db = await getDb();
  return queryOne<{ id: string; repo_id: string; pr_numbers: string; created_at: string }>(
    db,
    "SELECT id, repo_id, pr_numbers, created_at FROM skill_analyses WHERE id = ?",
    [analysisId],
  );
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
  const skills = await queryAll<Skill & { comment_ids: string | string[] }>(
    db,
    "SELECT * FROM skills WHERE analysis_id = ? ORDER BY frequency DESC",
    [analysisId],
  );

  const result: SkillWithComments[] = [];
  for (const skill of skills) {
    const commentIds: string[] =
      typeof skill.comment_ids === "string" ? JSON.parse(skill.comment_ids) : (skill.comment_ids ?? []);

    let comments: {
      id: string;
      body: string;
      reviewer: string;
      reviewer_avatar: string | null;
      file_path: string | null;
      line_number: number | null;
      pr_number: number;
      pr_title: string;
    }[] = [];

    if (commentIds.length > 0) {
      const placeholders = commentIds.map(() => "?").join(",");
      comments = await queryAll(
        db,
        `SELECT c.id, c.body, c.reviewer, c.reviewer_avatar, c.file_path, c.line_number, p.number as pr_number, p.title as pr_title
         FROM pr_comments c
         JOIN prs p ON c.pr_id = p.id
         WHERE c.id IN (${placeholders})`,
        commentIds,
      );
    }

    const { comment_ids: _commentIds, ...skillWithoutCommentIds } = skill;
    result.push({
      ...skillWithoutCommentIds,
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

export async function updateSkillActionItem(skillId: string, actionItem: string) {
  const db = await getDb();
  await execute(db, "UPDATE skills SET action_item = ? WHERE id = ?", [actionItem, skillId]);
}

export async function getAnalysisHistory(repoId: string) {
  const db = await getDb();
  const analyses = await queryAll<{
    id: string;
    pr_numbers: string;
    created_at: string;
  }>(db, "SELECT id, pr_numbers, created_at FROM skill_analyses WHERE repo_id = ? ORDER BY created_at DESC", [repoId]);

  const result: {
    id: string;
    prNumbers: number[];
    createdAt: string;
    skillCount: number;
    topSkills: string[];
  }[] = [];

  for (const analysis of analyses) {
    const skills = await queryAll<{ name: string }>(
      db,
      "SELECT name FROM skills WHERE analysis_id = ? ORDER BY frequency DESC LIMIT 3",
      [analysis.id],
    );
    const totalSkills = await queryOne<{ count: number }>(
      db,
      "SELECT COUNT(*) as count FROM skills WHERE analysis_id = ?",
      [analysis.id],
    );

    result.push({
      id: analysis.id,
      prNumbers: JSON.parse(analysis.pr_numbers),
      createdAt: analysis.created_at,
      skillCount: Number(totalSkills?.count ?? 0),
      topSkills: skills.map((s) => s.name),
    });
  }

  return result;
}

export interface SkillTrendPoint {
  analysisDate: string;
  skills: { name: string; frequency: number; severity: string }[];
}

export async function getSkillTrends(repoId: string): Promise<SkillTrendPoint[]> {
  const db = await getDb();
  const analyses = await queryAll<{ id: string; created_at: string }>(
    db,
    "SELECT id, created_at FROM skill_analyses WHERE repo_id = ? ORDER BY created_at ASC",
    [repoId],
  );

  const result: SkillTrendPoint[] = [];
  for (const analysis of analyses) {
    const skills = await queryAll<{ name: string; frequency: number; severity: string }>(
      db,
      "SELECT name, frequency, severity FROM skills WHERE analysis_id = ? ORDER BY frequency DESC",
      [analysis.id],
    );
    result.push({
      analysisDate: analysis.created_at,
      skills,
    });
  }
  return result;
}

export interface ComparisonSkill {
  name: string;
  status: "new" | "resolved" | "improved" | "worsened" | "unchanged";
  frequencyA: number | null;
  frequencyB: number | null;
  severityA: string | null;
  severityB: string | null;
}

export async function compareAnalyses(idA: string, idB: string): Promise<ComparisonSkill[]> {
  const db = await getDb();

  const skillsA = await queryAll<{ name: string; frequency: number; severity: string }>(
    db,
    "SELECT name, frequency, severity FROM skills WHERE analysis_id = ?",
    [idA],
  );
  const skillsB = await queryAll<{ name: string; frequency: number; severity: string }>(
    db,
    "SELECT name, frequency, severity FROM skills WHERE analysis_id = ?",
    [idB],
  );

  const mapA = new Map(skillsA.map((s) => [s.name, s]));
  const mapB = new Map(skillsB.map((s) => [s.name, s]));
  const allNames = new Set([...mapA.keys(), ...mapB.keys()]);

  const result: ComparisonSkill[] = [];
  for (const name of allNames) {
    const a = mapA.get(name);
    const b = mapB.get(name);

    let status: ComparisonSkill["status"];
    if (!a && b) {
      status = "new";
    } else if (a && !b) {
      status = "resolved";
    } else if (a && b) {
      if (b.frequency < a.frequency) status = "improved";
      else if (b.frequency > a.frequency) status = "worsened";
      else status = "unchanged";
    } else {
      continue;
    }

    result.push({
      name,
      status,
      frequencyA: a?.frequency ?? null,
      frequencyB: b?.frequency ?? null,
      severityA: a?.severity ?? null,
      severityB: b?.severity ?? null,
    });
  }

  // Sort: worsened first, then new, then unchanged, then improved, then resolved
  const order = { worsened: 0, new: 1, unchanged: 2, improved: 3, resolved: 4 };
  result.sort((a, b) => order[a.status] - order[b.status]);

  return result;
}
