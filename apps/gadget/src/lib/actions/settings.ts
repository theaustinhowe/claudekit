"use server";

import { DEFAULT_CLEANUP_FILES } from "@/lib/constants";
import { getDb } from "@/lib/db";
import { execute, queryAll, queryOne } from "@/lib/db/helpers";
import type { DashboardStats, OnboardingState } from "@/lib/types";
import { nowTimestamp } from "@/lib/utils";

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await queryOne<{ value: string }>(db, "SELECT value FROM settings WHERE key = ?", [key]);
  return row?.value ?? null;
}

export async function getEncryptionKey(): Promise<string | null> {
  const db = await getDb();
  const row = await queryOne<{ value: string }>(db, "SELECT value FROM settings WHERE key = 'encryption_key'");
  return row?.value || null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await execute(
    db,
    "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    [key, value, nowTimestamp()],
  );
}

export async function getCleanupFiles(): Promise<string[]> {
  const value = await getSetting("cleanup_invalid_files");
  if (!value) return DEFAULT_CLEANUP_FILES;
  try {
    return JSON.parse(value);
  } catch {
    return DEFAULT_CLEANUP_FILES;
  }
}

export async function setCleanupFiles(files: string[]): Promise<void> {
  await setSetting("cleanup_invalid_files", JSON.stringify(files));
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const db = await getDb();

  const repoCount =
    (await queryOne<{ count: number }>(db, "SELECT COUNT(*) as count FROM repos WHERE local_path != '__library__'"))
      ?.count ?? 0;
  const criticalCount =
    (await queryOne<{ count: number }>(db, "SELECT COUNT(*) as count FROM findings WHERE severity = 'critical'"))
      ?.count ?? 0;
  const warningCount =
    (await queryOne<{ count: number }>(db, "SELECT COUNT(*) as count FROM findings WHERE severity = 'warning'"))
      ?.count ?? 0;
  const fixCount = (await queryOne<{ count: number }>(db, "SELECT COUNT(*) as count FROM fix_actions"))?.count ?? 0;

  const staleRepoCount =
    (
      await queryOne<{ count: number }>(
        db,
        "SELECT COUNT(*) as count FROM repos WHERE (last_scanned_at IS NULL OR CAST(last_scanned_at AS TIMESTAMP) < current_timestamp - INTERVAL '14 days') AND local_path != '__library__'",
      )
    )?.count ?? 0;

  const criticalRepoCount =
    (
      await queryOne<{ count: number }>(
        db,
        "SELECT COUNT(DISTINCT repo_id) as count FROM findings WHERE severity = 'critical'",
      )
    )?.count ?? 0;

  const lastScanRow = await queryOne<{ last_completed: string | null }>(
    db,
    "SELECT MAX(completed_at) as last_completed FROM scans WHERE status = 'done'",
  );

  const conceptCount = (await queryOne<{ count: number }>(db, "SELECT COUNT(*) as count FROM concepts"))?.count ?? 0;

  const staleSourceCount =
    (
      await queryOne<{ count: number }>(
        db,
        "SELECT COUNT(*) as count FROM concept_sources WHERE last_scanned_at IS NULL OR CAST(last_scanned_at AS TIMESTAMP) < current_timestamp - INTERVAL '14 days'",
      )
    )?.count ?? 0;

  const policyCount = (await queryOne<{ count: number }>(db, "SELECT COUNT(*) as count FROM policies"))?.count ?? 0;

  return {
    reposAudited: Number(repoCount),
    criticalFindings: Number(criticalCount),
    warningFindings: Number(warningCount),
    pendingFixes: Number(fixCount),
    staleRepoCount: Number(staleRepoCount),
    criticalRepoCount: Number(criticalRepoCount),
    lastScanCompletedAt: lastScanRow?.last_completed ?? null,
    conceptCount: Number(conceptCount),
    staleSources: Number(staleSourceCount),
    policyCount: Number(policyCount),
  };
}

export async function getDashboardOnboardingState(): Promise<OnboardingState> {
  const db = await getDb();
  const scanRoots = await queryAll<{ id: string }>(db, "SELECT id FROM scan_roots LIMIT 1");
  const completedScans = await queryOne<{ count: number }>(
    db,
    "SELECT COUNT(*) as count FROM scans WHERE status = 'done'",
  );
  const appliedFixes = await queryOne<{ count: number }>(
    db,
    "SELECT COUNT(*) as count FROM apply_runs WHERE status = 'done'",
  );
  return {
    hasScanRoots: scanRoots.length > 0,
    hasCompletedScan: Number(completedScans?.count ?? 0) > 0,
    hasAppliedFix: Number(appliedFixes?.count ?? 0) > 0,
  };
}
