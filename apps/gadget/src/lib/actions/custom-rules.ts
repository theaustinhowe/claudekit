"use server";

import { buildUpdate, execute, getDb, parseJsonField, queryAll, queryOne } from "@/lib/db";
import type { CustomRule } from "@/lib/types";
import { generateId, nowTimestamp } from "@/lib/utils";

function parseRule(row: Record<string, unknown>): CustomRule {
  return {
    ...row,
    config: parseJsonField(row.config, {}) as Record<string, unknown>,
    suggested_actions: parseJsonField(row.suggested_actions, []) as string[],
  } as unknown as CustomRule;
}

export async function getCustomRules(policyId?: string): Promise<CustomRule[]> {
  const db = await getDb();
  if (policyId) {
    const rows = await queryAll<Record<string, unknown>>(
      db,
      "SELECT * FROM custom_rules WHERE policy_id = ? OR policy_id IS NULL ORDER BY is_builtin DESC, name ASC",
      [policyId],
    );
    return rows.map((r) => parseRule(r));
  }
  const rows = await queryAll<Record<string, unknown>>(
    db,
    "SELECT * FROM custom_rules ORDER BY is_builtin DESC, name ASC",
  );
  return rows.map((r) => parseRule(r));
}

export async function getEnabledRulesForPolicy(policyId: string): Promise<CustomRule[]> {
  const db = await getDb();
  const rows = await queryAll<Record<string, unknown>>(
    db,
    "SELECT * FROM custom_rules WHERE is_enabled = true AND (policy_id = ? OR policy_id IS NULL) ORDER BY name ASC",
    [policyId],
  );
  return rows.map((r) => parseRule(r));
}

export async function createCustomRule(data: {
  name: string;
  description?: string;
  category?: string;
  severity?: string;
  rule_type: string;
  config: Record<string, unknown>;
  suggested_actions?: string[];
  policy_id?: string | null;
}): Promise<CustomRule> {
  const db = await getDb();
  const id = generateId();
  const now = nowTimestamp();

  await execute(
    db,
    `INSERT INTO custom_rules (id, name, description, category, severity, rule_type, config, suggested_actions, policy_id, is_enabled, is_builtin, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, true, false, ?, ?)`,
    [
      id,
      data.name,
      data.description || null,
      data.category || "custom",
      data.severity || "warning",
      data.rule_type,
      JSON.stringify(data.config),
      JSON.stringify(data.suggested_actions || []),
      data.policy_id || null,
      now,
      now,
    ],
  );

  const row = await queryOne<Record<string, unknown>>(db, "SELECT * FROM custom_rules WHERE id = ?", [id]);
  if (!row) throw new Error("Failed to create custom rule");
  return parseRule(row);
}

export async function updateCustomRule(
  id: string,
  data: Partial<{
    name: string;
    description: string;
    category: string;
    severity: string;
    rule_type: string;
    config: Record<string, unknown>;
    suggested_actions: string[];
    policy_id: string | null;
    is_enabled: boolean;
  }>,
): Promise<CustomRule | null> {
  const db = await getDb();
  const jsonFields = new Set(["config", "suggested_actions"]);
  const update = buildUpdate("custom_rules", id, data, jsonFields);
  if (update) {
    await execute(db, update.sql, update.params);
  }

  const row = await queryOne<Record<string, unknown>>(db, "SELECT * FROM custom_rules WHERE id = ?", [id]);
  if (!row) return null;
  return parseRule(row);
}

export async function deleteCustomRule(id: string): Promise<void> {
  const db = await getDb();
  await execute(db, "DELETE FROM custom_rules WHERE id = ? AND is_builtin = false", [id]);
}

export async function toggleCustomRule(id: string, enabled: boolean): Promise<void> {
  const db = await getDb();
  await execute(db, "UPDATE custom_rules SET is_enabled = ?, updated_at = ? WHERE id = ?", [
    enabled,
    nowTimestamp(),
    id,
  ]);
}
