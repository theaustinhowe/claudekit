"use server";

import fs from "node:fs";
import { buildUpdate, execute, getDb, parseJsonField, queryAll, queryOne } from "@/lib/db";
import { buildImplementationPrompt } from "@/lib/services/scaffold-prompt";
import { deleteScreenshotFiles } from "@/lib/services/screenshot-service";
import type { DesignMessage, GeneratorProject, MockEntity, SpecDiff, UiSpec } from "@/lib/types";
import { expandTilde, generateId, nowTimestamp } from "@/lib/utils";

function parseProject(row: GeneratorProject): GeneratorProject {
  return {
    ...row,
    services: parseJsonField(row.services, []),
    constraints: parseJsonField(row.constraints, []),
    design_vibes: parseJsonField(row.design_vibes, []),
    inspiration_urls: parseJsonField(row.inspiration_urls, []),
    color_scheme: parseJsonField(row.color_scheme, {}),
    custom_features: parseJsonField(row.custom_features, []),
    scaffold_logs: parseJsonField(row.scaffold_logs, null),
  };
}

function parseMessage(row: Record<string, unknown>): DesignMessage {
  return {
    ...row,
    spec_diff: parseJsonField(row.spec_diff_json, null),
    progress_logs: parseJsonField(row.progress_logs_json, null),
    suggestions: parseJsonField(row.suggestions_json, null),
  } as DesignMessage;
}

export async function createGeneratorProject(data: {
  title: string;
  idea_description: string;
  app_type?: string;
  platform: string;
  services: string[];
  constraints: string[];
  project_name: string;
  project_path: string;
  package_manager: string;
  ai_provider?: string;
  ai_model?: string;
  template_id?: string;
  design_vibes?: string[];
  inspiration_urls?: string[];
  color_scheme?: { primary?: string; accent?: string };
  custom_features?: string[];
  tool_versions?: Record<string, string>;
}): Promise<GeneratorProject> {
  const db = await getDb();
  const id = generateId();
  const now = nowTimestamp();

  // Build a partial project object for generating the implementation prompt
  const partialProject = {
    title: data.title,
    idea_description: data.idea_description,
    app_type: data.app_type || "web",
    platform: data.platform,
    services: data.services,
    constraints: data.constraints,
    project_name: data.project_name,
    project_path: data.project_path,
    package_manager: data.package_manager,
  } as GeneratorProject;
  const implPrompt = buildImplementationPrompt(partialProject);

  await execute(
    db,
    `INSERT INTO generator_projects (id, title, idea_description, app_type, platform, services, constraints, project_name, project_path, package_manager, ai_provider, ai_model, template_id, status, active_spec_version, implementation_prompt, design_vibes, inspiration_urls, color_scheme, custom_features, tool_versions, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scaffolding', 0, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.title,
      data.idea_description,
      data.app_type || "web",
      data.platform,
      JSON.stringify(data.services),
      JSON.stringify(data.constraints),
      data.project_name,
      data.project_path,
      data.package_manager,
      data.ai_provider || "anthropic",
      data.ai_model || null,
      data.template_id || null,
      implPrompt,
      JSON.stringify(data.design_vibes || []),
      JSON.stringify(data.inspiration_urls || []),
      JSON.stringify(data.color_scheme || {}),
      JSON.stringify(data.custom_features || []),
      JSON.stringify(data.tool_versions || {}),
      now,
      now,
    ],
  );

  const row = await queryOne<GeneratorProject>(db, "SELECT * FROM generator_projects WHERE id = ?", [id]);
  if (!row) throw new Error(`Failed to create generator project: ${id}`);
  return parseProject(row);
}

export async function getGeneratorProject(id: string): Promise<GeneratorProject | null> {
  const db = await getDb();
  const row = await queryOne<GeneratorProject>(db, "SELECT * FROM generator_projects WHERE id = ?", [id]);
  return row ? parseProject(row) : null;
}

export async function getGeneratorProjects(): Promise<GeneratorProject[]> {
  const db = await getDb();
  const rows = await queryAll<GeneratorProject>(db, "SELECT * FROM generator_projects ORDER BY updated_at DESC");
  return rows.map(parseProject);
}

export async function updateGeneratorProject(
  id: string,
  data: Partial<
    Pick<
      GeneratorProject,
      | "title"
      | "status"
      | "active_spec_version"
      | "ai_provider"
      | "ai_model"
      | "exported_at"
      | "implementation_prompt"
      | "dev_server_port"
      | "dev_server_pid"
    >
  > & { scaffold_logs?: { log: string; logType: string }[] | null },
): Promise<void> {
  const db = await getDb();
  const jsonFields = new Set(["scaffold_logs"]);
  const update = buildUpdate("generator_projects", id, data as Record<string, unknown>, jsonFields);
  if (!update) return;
  await execute(db, update.sql, update.params);
}

export async function deleteGeneratorProject(id: string): Promise<void> {
  const db = await getDb();
  await execute(db, "DELETE FROM project_screenshots WHERE project_id = ?", [id]);
  await execute(db, "DELETE FROM upgrade_tasks WHERE project_id = ?", [id]);
  await execute(db, "DELETE FROM project_specs WHERE project_id = ?", [id]);
  await execute(db, "DELETE FROM design_messages WHERE project_id = ?", [id]);
  await execute(db, "DELETE FROM generator_projects WHERE id = ?", [id]);
  deleteScreenshotFiles(id);
}

export async function getProjectCounts(): Promise<{ active: number; archived: number }> {
  const db = await getDb();
  const row = await queryOne<{ active: number; archived: number }>(
    db,
    `SELECT
       count(*) FILTER (WHERE status != 'archived') AS active,
       count(*) FILTER (WHERE status = 'archived') AS archived
     FROM generator_projects`,
  );
  return row ?? { active: 0, archived: 0 };
}

// --- Project Specs (replaces ui_specs, mock_data_sets, spec_snapshots) ---

export async function getUiSpec(projectId: string, version?: number): Promise<UiSpec | null> {
  const db = await getDb();
  const row = version
    ? await queryOne<{ spec_json: unknown }>(
        db,
        "SELECT spec_json FROM project_specs WHERE project_id = ? AND version = ?",
        [projectId, version],
      )
    : await queryOne<{ spec_json: unknown }>(
        db,
        "SELECT spec_json FROM project_specs WHERE project_id = ? ORDER BY version DESC LIMIT 1",
        [projectId],
      );
  return row ? parseJsonField(row.spec_json, null) : null;
}

export async function getMockData(projectId: string, specVersion: number): Promise<MockEntity[]> {
  const db = await getDb();
  const row = await queryOne<{ mock_data_json: unknown }>(
    db,
    "SELECT mock_data_json FROM project_specs WHERE project_id = ? AND version = ? ORDER BY created_at DESC LIMIT 1",
    [projectId, specVersion],
  );
  return row ? parseJsonField(row.mock_data_json, []) : [];
}

// --- Design Messages ---

export async function getDesignMessages(projectId: string): Promise<DesignMessage[]> {
  const db = await getDb();
  const rows = await queryAll<Record<string, unknown>>(
    db,
    "SELECT * FROM design_messages WHERE project_id = ? ORDER BY created_at ASC",
    [projectId],
  );
  return rows.map(parseMessage);
}

export async function createDesignMessage(data: {
  project_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  spec_diff?: SpecDiff | null;
  model_used?: string | null;
  progress_logs?: { log: string; logType: string }[] | null;
  suggestions?: string[] | null;
}): Promise<DesignMessage> {
  const db = await getDb();
  const id = generateId();
  await execute(
    db,
    "INSERT INTO design_messages (id, project_id, role, content, spec_diff_json, model_used, progress_logs_json, suggestions_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [
      id,
      data.project_id,
      data.role,
      data.content,
      data.spec_diff ? JSON.stringify(data.spec_diff) : null,
      data.model_used || null,
      data.progress_logs?.length ? JSON.stringify(data.progress_logs) : null,
      data.suggestions?.length ? JSON.stringify(data.suggestions) : null,
    ],
  );

  return {
    id,
    project_id: data.project_id,
    role: data.role,
    content: data.content,
    spec_diff: data.spec_diff || null,
    model_used: data.model_used || null,
    progress_logs: data.progress_logs || null,
    suggestions: data.suggestions || null,
    created_at: nowTimestamp(),
  };
}

export async function checkPathExists(fullPath: string): Promise<boolean> {
  return fs.existsSync(expandTilde(fullPath));
}
