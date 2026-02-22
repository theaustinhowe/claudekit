"use server";

import { getSetting, setSetting } from "@/lib/actions/settings";
import { execute, getDb, queryAll } from "@/lib/db";
import type { AutoFixRun } from "@/lib/types";
import { generateId, nowTimestamp } from "@/lib/utils";

export async function saveAutoFixRun(data: {
  projectId: string;
  status: "running" | "success" | "failed" | "cancelled";
  errorSignature: string;
  errorMessage: string;
  claudeOutput?: string;
  attemptNumber: number;
  logs: Array<{ log: string; logType: string }>;
}): Promise<string> {
  const db = await getDb();
  const id = generateId();
  const now = nowTimestamp();
  await execute(
    db,
    `INSERT INTO auto_fix_runs (id, project_id, status, error_signature, error_message, claude_output, attempt_number, logs_json, started_at, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.projectId,
      data.status,
      data.errorSignature,
      data.errorMessage,
      data.claudeOutput ?? null,
      data.attemptNumber,
      JSON.stringify(data.logs),
      now,
      data.status !== "running" ? now : null,
    ],
  );
  return id;
}

export async function updateAutoFixRun(
  id: string,
  updates: {
    status?: "running" | "success" | "failed" | "cancelled";
    claudeOutput?: string;
    logs?: Array<{ log: string; logType: string }>;
  },
): Promise<void> {
  const db = await getDb();
  const sets: string[] = [];
  const params: unknown[] = [];

  if (updates.status) {
    sets.push("status = ?");
    params.push(updates.status);
    if (updates.status !== "running") {
      sets.push("completed_at = ?");
      params.push(nowTimestamp());
    }
  }
  if (updates.claudeOutput !== undefined) {
    sets.push("claude_output = ?");
    params.push(updates.claudeOutput);
  }
  if (updates.logs) {
    sets.push("logs_json = ?");
    params.push(JSON.stringify(updates.logs));
  }

  if (sets.length === 0) return;
  params.push(id);
  await execute(db, `UPDATE auto_fix_runs SET ${sets.join(", ")} WHERE id = ?`, params);
}

export async function getAutoFixHistory(projectId: string, limit = 20): Promise<AutoFixRun[]> {
  const db = await getDb();
  const rows = await queryAll<AutoFixRun>(
    db,
    "SELECT * FROM auto_fix_runs WHERE project_id = ? ORDER BY started_at DESC LIMIT ?",
    [projectId, limit],
  );
  return rows;
}

export async function getAutoFixEnabled(projectId: string): Promise<boolean> {
  const value = await getSetting(`autofix_enabled_${projectId}`);
  return value === "true";
}

export async function setAutoFixEnabled(projectId: string, enabled: boolean): Promise<void> {
  await setSetting(`autofix_enabled_${projectId}`, String(enabled));
}
