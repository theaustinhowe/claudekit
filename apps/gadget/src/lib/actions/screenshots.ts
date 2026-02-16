"use server";

import { getDb } from "@/lib/db";
import { execute, queryAll, queryOne } from "@/lib/db/helpers";
import type { ProjectScreenshot } from "@/lib/types";
import { generateId, nowTimestamp } from "@/lib/utils";

export async function saveScreenshot(data: {
  project_id: string;
  file_path: string;
  label?: string;
  width?: number;
  height?: number;
  file_size?: number;
  message_id?: string;
}): Promise<ProjectScreenshot> {
  const db = await getDb();
  const id = generateId();
  const now = nowTimestamp();

  await execute(
    db,
    `INSERT INTO project_screenshots (id, project_id, file_path, label, width, height, file_size, message_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.project_id,
      data.file_path,
      data.label || null,
      data.width || 1280,
      data.height || 800,
      data.file_size || 0,
      data.message_id || null,
      now,
    ],
  );

  return {
    id,
    project_id: data.project_id,
    file_path: data.file_path,
    label: data.label || null,
    width: data.width || 1280,
    height: data.height || 800,
    file_size: data.file_size || 0,
    message_id: data.message_id || null,
    created_at: now,
  };
}

export async function getProjectScreenshots(projectId: string): Promise<ProjectScreenshot[]> {
  const db = await getDb();
  return queryAll<ProjectScreenshot>(
    db,
    "SELECT * FROM project_screenshots WHERE project_id = ? ORDER BY created_at ASC",
    [projectId],
  );
}

export async function getLatestScreenshot(projectId: string): Promise<ProjectScreenshot | null> {
  const db = await getDb();
  const row = await queryOne<ProjectScreenshot>(
    db,
    "SELECT * FROM project_screenshots WHERE project_id = ? ORDER BY created_at DESC LIMIT 1",
    [projectId],
  );
  return row ?? null;
}
