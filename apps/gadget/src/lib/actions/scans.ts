"use server";

import { execute, getDb, queryAll, queryOne } from "@/lib/db";
import type { ScanRoot } from "@/lib/types";
import { generateId } from "@/lib/utils";

export async function getScanRoots(): Promise<ScanRoot[]> {
  const db = await getDb();
  return queryAll<ScanRoot>(db, "SELECT * FROM scan_roots ORDER BY created_at DESC");
}

export async function createScanRoot(path: string): Promise<ScanRoot> {
  const db = await getDb();
  const existing = await queryOne<ScanRoot>(db, "SELECT * FROM scan_roots WHERE path = ?", [path]);
  if (existing) return existing;
  const id = generateId();
  await execute(db, "INSERT INTO scan_roots (id, path) VALUES (?, ?)", [id, path]);
  const created = await queryOne<ScanRoot>(db, "SELECT * FROM scan_roots WHERE id = ?", [id]);
  if (!created) throw new Error(`Failed to create scan root with id ${id}`);
  return created;
}

export async function deleteScanRoot(id: string): Promise<void> {
  const db = await getDb();
  await execute(db, "DELETE FROM scan_roots WHERE id = ?", [id]);
}
