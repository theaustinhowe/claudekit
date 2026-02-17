"use server";

import { execute, getDb, queryOne } from "@/lib/db";

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await queryOne<{ value: string }>(db, "SELECT value FROM settings WHERE key = ?", [key]);
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await execute(
    db,
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
    [key, value],
  );
}

export async function getSettings(keys: string[]): Promise<Record<string, string>> {
  const db = await getDb();
  const result: Record<string, string> = {};
  for (const key of keys) {
    const row = await queryOne<{ value: string }>(db, "SELECT value FROM settings WHERE key = ?", [key]);
    if (row) result[key] = row.value;
  }
  return result;
}
