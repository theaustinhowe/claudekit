"use server";

import { getDb } from "@/lib/db";
import { buildUpdate, execute, queryAll, queryOne } from "@/lib/db/helpers";
import type { Policy } from "@/lib/types";
import { generateId, parsePolicy } from "@/lib/utils";

export async function getPolicies(): Promise<Policy[]> {
  const db = await getDb();
  const rows = await queryAll<Record<string, unknown>>(db, "SELECT * FROM policies ORDER BY is_builtin DESC, name ASC");
  return rows.map((r) => parsePolicy(r));
}

async function getPolicyById(id: string): Promise<Policy | null> {
  const db = await getDb();
  const row = await queryOne<Record<string, unknown>>(db, "SELECT * FROM policies WHERE id = ?", [id]);
  if (!row) return null;
  return parsePolicy(row);
}

export async function createPolicy(data: {
  name: string;
  description?: string;
  expected_versions?: Record<string, string>;
  banned_dependencies?: Array<{ name: string; replacement?: string; reason: string }>;
  allowed_package_managers?: string[];
  preferred_package_manager?: string;
  ignore_patterns?: string[];
  generator_defaults?: { template?: string; features: string[] };
  repo_types?: string[];
}): Promise<Policy> {
  const db = await getDb();
  const id = generateId();

  await execute(
    db,
    `
    INSERT INTO policies (id, name, description, expected_versions, banned_dependencies, allowed_package_managers, preferred_package_manager, ignore_patterns, generator_defaults, repo_types, is_builtin)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, false)
  `,
    [
      id,
      data.name,
      data.description || null,
      JSON.stringify(data.expected_versions || {}),
      JSON.stringify(data.banned_dependencies || []),
      JSON.stringify(data.allowed_package_managers || []),
      data.preferred_package_manager || "pnpm",
      JSON.stringify(data.ignore_patterns || []),
      JSON.stringify(data.generator_defaults || { features: [] }),
      JSON.stringify(data.repo_types || []),
    ],
  );

  const created = await getPolicyById(id);
  if (!created) throw new Error(`Failed to create policy with id ${id}`);
  return created;
}

export async function updatePolicy(
  id: string,
  data: Partial<{
    name: string;
    description: string;
    expected_versions: Record<string, string>;
    banned_dependencies: Array<{ name: string; replacement?: string; reason: string }>;
    allowed_package_managers: string[];
    preferred_package_manager: string;
    ignore_patterns: string[];
    generator_defaults: { template?: string; features: string[] };
    repo_types: string[];
  }>,
): Promise<Policy | null> {
  const db = await getDb();
  const existing = await getPolicyById(id);
  if (!existing) return null;

  const jsonFields = new Set([
    "expected_versions",
    "banned_dependencies",
    "allowed_package_managers",
    "ignore_patterns",
    "generator_defaults",
    "repo_types",
  ]);
  const update = buildUpdate("policies", id, data, jsonFields);
  if (update) {
    await execute(db, update.sql, update.params);
  }

  return getPolicyById(id);
}

export async function deletePolicy(id: string): Promise<void> {
  const db = await getDb();
  await execute(db, "DELETE FROM policies WHERE id = ? AND is_builtin = false", [id]);
}
