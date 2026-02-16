"use server";

import { getDb } from "@/lib/db";
import { execute, parseJsonField, queryAll, queryOne } from "@/lib/db/helpers";
import type { PolicyTemplate } from "@/lib/types";
import { generateId, nowTimestamp } from "@/lib/utils";

function parseTemplate(row: Record<string, unknown>): PolicyTemplate {
  return {
    ...row,
    defaults: parseJsonField(row.defaults, {}),
  } as PolicyTemplate;
}

export async function getPolicyTemplates(): Promise<PolicyTemplate[]> {
  const db = await getDb();
  const rows = await queryAll<Record<string, unknown>>(
    db,
    "SELECT * FROM policy_templates ORDER BY is_builtin DESC, name ASC",
  );
  return rows.map((r) => parseTemplate(r));
}

export async function createPolicyTemplate(data: {
  name: string;
  description?: string;
  icon?: string;
  defaults?: Record<string, unknown>;
  category?: string;
}): Promise<PolicyTemplate> {
  const db = await getDb();
  const id = generateId();
  const now = nowTimestamp();

  await execute(
    db,
    `INSERT INTO policy_templates (id, name, description, icon, defaults, category, is_builtin, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, false, ?, ?)`,
    [
      id,
      data.name,
      data.description || null,
      data.icon || null,
      JSON.stringify(data.defaults || {}),
      data.category || null,
      now,
      now,
    ],
  );

  const row = await queryOne<Record<string, unknown>>(db, "SELECT * FROM policy_templates WHERE id = ?", [id]);
  if (!row) throw new Error("Failed to create policy template");
  return parseTemplate(row);
}

export async function deletePolicyTemplate(id: string): Promise<void> {
  const db = await getDb();
  await execute(db, "DELETE FROM policy_templates WHERE id = ? AND is_builtin = false", [id]);
}
