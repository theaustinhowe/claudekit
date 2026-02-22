"use server";

import { execute, getDb, queryOne } from "@/lib/db";
import { nowTimestamp } from "@/lib/utils";

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await queryOne<{ value: string }>(db, "SELECT value FROM settings WHERE key = ?", [key]);
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await execute(
    db,
    "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    [key, value, nowTimestamp()],
  );
}
