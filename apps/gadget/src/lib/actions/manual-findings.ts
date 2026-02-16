"use server";

import { getDb } from "@/lib/db";
import { buildUpdate, execute, parseJsonField, queryAll, queryOne } from "@/lib/db/helpers";
import type { ManualFinding } from "@/lib/types";
import { generateId, nowTimestamp } from "@/lib/utils";

function parseManualFinding(row: Record<string, unknown>): ManualFinding {
  return {
    ...row,
    suggested_actions: parseJsonField(row.suggested_actions, []),
  } as unknown as ManualFinding;
}

export async function getManualFindingsForRepo(repoId: string): Promise<ManualFinding[]> {
  const db = await getDb();
  const rows = await queryAll<Record<string, unknown>>(
    db,
    `SELECT * FROM manual_findings WHERE repo_id = ?
     ORDER BY
       CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
       created_at DESC`,
    [repoId],
  );
  return rows.map((r) => parseManualFinding(r));
}

export async function createManualFinding(data: {
  repo_id: string;
  category?: string;
  severity?: string;
  title: string;
  details?: string;
  evidence?: string;
  suggested_actions?: string[];
  created_by?: string;
}): Promise<ManualFinding> {
  const db = await getDb();
  const id = generateId();
  const now = nowTimestamp();

  await execute(
    db,
    `INSERT INTO manual_findings (id, repo_id, category, severity, title, details, evidence, suggested_actions, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.repo_id,
      data.category || "custom",
      data.severity || "warning",
      data.title,
      data.details || null,
      data.evidence || null,
      JSON.stringify(data.suggested_actions || []),
      data.created_by || null,
      now,
      now,
    ],
  );

  const row = await queryOne<Record<string, unknown>>(db, "SELECT * FROM manual_findings WHERE id = ?", [id]);
  if (!row) throw new Error("Failed to create manual finding");
  return parseManualFinding(row);
}

export async function updateManualFinding(
  id: string,
  data: Partial<{
    category: string;
    severity: string;
    title: string;
    details: string;
    evidence: string;
    suggested_actions: string[];
  }>,
): Promise<ManualFinding | null> {
  const db = await getDb();
  const jsonFields = new Set(["suggested_actions"]);
  const update = buildUpdate("manual_findings", id, data, jsonFields);
  if (update) {
    await execute(db, update.sql, update.params);
  }

  const row = await queryOne<Record<string, unknown>>(db, "SELECT * FROM manual_findings WHERE id = ?", [id]);
  if (!row) return null;
  return parseManualFinding(row);
}

export async function deleteManualFinding(id: string): Promise<void> {
  const db = await getDb();
  await execute(db, "DELETE FROM manual_findings WHERE id = ?", [id]);
}

export async function resolveManualFinding(id: string): Promise<void> {
  const db = await getDb();
  const now = nowTimestamp();
  await execute(db, "UPDATE manual_findings SET is_resolved = true, resolved_at = ?, updated_at = ? WHERE id = ?", [
    now,
    now,
    id,
  ]);
}

export async function unresolveManualFinding(id: string): Promise<void> {
  const db = await getDb();
  await execute(db, "UPDATE manual_findings SET is_resolved = false, resolved_at = NULL, updated_at = ? WHERE id = ?", [
    nowTimestamp(),
    id,
  ]);
}
