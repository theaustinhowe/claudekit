"use server";

import { getDb } from "@/lib/db";
import { execute, queryOne } from "@/lib/db/helpers";

export async function restoreApplyRun(runId: string): Promise<{ success: boolean; error?: string }> {
  const db = await getDb();
  const run = await queryOne<Record<string, unknown>>(db, "SELECT * FROM apply_runs WHERE id = ?", [runId]);
  if (!run || !run.snapshot_id) return { success: false, error: "No snapshot found" };

  const repo = await queryOne<{ local_path: string }>(db, "SELECT * FROM repos WHERE id = ?", [run.repo_id as string]);
  if (!repo) return { success: false, error: "Repo not found" };

  const { restoreSnapshot } = await import("@/lib/services/apply-engine");
  const restored = await restoreSnapshot(run.snapshot_id as string, repo.local_path);
  if (!restored) return { success: false, error: "Restore failed" };

  await execute(db, "UPDATE apply_runs SET status = 'rolled_back' WHERE id = ?", [runId]);
  return { success: true };
}
