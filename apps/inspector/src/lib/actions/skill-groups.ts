"use server";

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getDb, queryAll, queryOne } from "@/lib/db";
import { createServiceLogger } from "@/lib/logger";
import type { SkillGroup } from "@/lib/types";

const log = createServiceLogger("skill-groups");

export async function getSkillGroups(): Promise<SkillGroup[]> {
  const db = await getDb();
  const groups = await queryAll<{
    id: string;
    name: string;
    category: string;
    description: string | null;
    created_at: string;
    updated_at: string;
    skill_count: number;
  }>(
    db,
    `SELECT sg.*, (SELECT COUNT(*) FROM skills s WHERE s.group_id = sg.id) as skill_count
     FROM skill_groups sg
     ORDER BY sg.name ASC`,
  );

  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    category: g.category,
    description: g.description,
    createdAt: g.created_at,
    updatedAt: g.updated_at,
    skillCount: Number(g.skill_count),
  }));
}

async function getSkillGroup(id: string) {
  const db = await getDb();
  const group = await queryOne<{
    id: string;
    name: string;
    category: string;
    description: string | null;
    created_at: string;
    updated_at: string;
  }>(db, "SELECT * FROM skill_groups WHERE id = ?", [id]);

  if (!group) return null;

  const skills = await queryAll<{
    id: string;
    name: string;
    severity: string;
    description: string | null;
    rule_content: string | null;
    frequency: number;
    analysis_id: string;
  }>(
    db,
    "SELECT id, name, severity, description, rule_content, frequency, analysis_id FROM skills WHERE group_id = ? ORDER BY name",
    [id],
  );

  return { ...group, skills };
}

function generateSkillMdContent(
  skill: { name: string; description: string | null; rule_content: string | null },
  groupCategory: string,
): string {
  const lines = [
    "---",
    `name: ${groupCategory}-${skill.name}`,
    `description: ${skill.description || "No description"}`,
    "user-invocable: false",
    "---",
    "",
    skill.rule_content || "No rule content generated.",
  ];
  return lines.join("\n");
}

export async function getSkillGroupPreview(groupId: string): Promise<string[]> {
  const group = await getSkillGroup(groupId);
  if (!group) return [];

  return group.skills.map((skill) => generateSkillMdContent(skill, group.category));
}

export async function exportSkillGroupAsFiles(
  groupId: string,
  target: "local" | "global",
  projectPath?: string,
): Promise<{ filesWritten: number; directory: string }> {
  const group = await getSkillGroup(groupId);
  if (!group) throw new Error("Skill group not found");

  let baseDir: string;
  if (target === "global") {
    baseDir = path.join(os.homedir(), ".claude", "skills", group.category);
  } else {
    if (!projectPath) throw new Error("Project path required for local export");
    baseDir = path.join(projectPath, ".claude", "skills", group.category);
  }

  await fs.mkdir(baseDir, { recursive: true });

  let filesWritten = 0;
  for (const skill of group.skills) {
    if (!skill.rule_content) continue;
    const content = generateSkillMdContent(skill, group.category);
    const fileName = `${skill.name}.md`;
    await fs.writeFile(path.join(baseDir, fileName), content, "utf-8");
    filesWritten++;
  }

  log.info({ groupId, target, filesWritten, directory: baseDir }, "Skill group exported");
  return { filesWritten, directory: baseDir };
}
