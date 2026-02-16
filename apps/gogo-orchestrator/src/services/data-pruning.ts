import { execute, queryAll } from "@devkit/duckdb";
import { getDb } from "../db/index.js";
import { createServiceLogger } from "../utils/logger.js";

const log = createServiceLogger("data-pruning");

const DEFAULT_LOG_RETENTION_DAYS = 14;
const DEFAULT_JOB_RETENTION_DAYS = 90;
const TERMINAL_STATUSES = ["done", "failed"];

/**
 * Get IDs of completed/failed jobs older than the given cutoff date.
 */
async function getOldTerminalJobIds(cutoff: Date): Promise<string[]> {
  const conn = await getDb();
  const cutoffStr = cutoff.toISOString();

  const oldJobs = await queryAll<{ id: string }>(
    conn,
    "SELECT id FROM jobs WHERE updated_at < ? AND status IN (?, ?)",
    [cutoffStr, TERMINAL_STATUSES[0], TERMINAL_STATUSES[1]],
  );

  return oldJobs.map((j) => j.id);
}

/**
 * Build a cutoff date from a retention period in days.
 */
function cutoffFromDays(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

/**
 * Prune old job logs for completed/failed jobs older than N days.
 */
async function pruneOldLogs(retentionDays = DEFAULT_LOG_RETENTION_DAYS): Promise<number> {
  const jobIds = await getOldTerminalJobIds(cutoffFromDays(retentionDays));
  if (jobIds.length === 0) return 0;

  const conn = await getDb();
  let totalDeleted = 0;
  for (const jobId of jobIds) {
    const before = await queryAll<{ id: string }>(conn, "SELECT id FROM job_logs WHERE job_id = ?", [jobId]);
    await execute(conn, "DELETE FROM job_logs WHERE job_id = ?", [jobId]);
    totalDeleted += before.length;
  }

  if (totalDeleted > 0) {
    log.info({ totalDeleted, jobCount: jobIds.length, retentionDays }, "Pruned log entries");
  }
  return totalDeleted;
}

/**
 * Prune old job events for completed/failed jobs older than N days.
 */
async function pruneOldEvents(retentionDays = DEFAULT_LOG_RETENTION_DAYS): Promise<number> {
  const jobIds = await getOldTerminalJobIds(cutoffFromDays(retentionDays));
  if (jobIds.length === 0) return 0;

  const conn = await getDb();
  let totalDeleted = 0;
  for (const jobId of jobIds) {
    const before = await queryAll<{ id: string }>(conn, "SELECT id FROM job_events WHERE job_id = ?", [jobId]);
    await execute(conn, "DELETE FROM job_events WHERE job_id = ?", [jobId]);
    totalDeleted += before.length;
  }

  if (totalDeleted > 0) {
    log.info({ totalDeleted, jobCount: jobIds.length, retentionDays }, "Pruned event entries");
  }
  return totalDeleted;
}

/**
 * Prune archived jobs (done/failed) older than N days.
 * Deletes associated logs and events first, then removes the job records.
 */
async function pruneArchivedJobs(retentionDays = DEFAULT_JOB_RETENTION_DAYS): Promise<number> {
  const jobIds = await getOldTerminalJobIds(cutoffFromDays(retentionDays));
  if (jobIds.length === 0) return 0;

  const conn = await getDb();
  for (const jobId of jobIds) {
    await execute(conn, "DELETE FROM job_logs WHERE job_id = ?", [jobId]);
    await execute(conn, "DELETE FROM job_events WHERE job_id = ?", [jobId]);
    await execute(conn, "DELETE FROM jobs WHERE id = ?", [jobId]);
  }

  log.info({ jobCount: jobIds.length, retentionDays }, "Pruned archived jobs");
  return jobIds.length;
}

/**
 * Run all pruning tasks. Called on startup.
 */
export async function runDataPruning(): Promise<void> {
  log.info("Starting data pruning...");

  try {
    const logs = await pruneOldLogs();
    const events = await pruneOldEvents();
    const archivedJobs = await pruneArchivedJobs();

    if (logs > 0 || events > 0 || archivedJobs > 0) {
      log.info({ logs, events, archivedJobs }, "Data pruning complete");
    } else {
      log.info("No old data to prune");
    }
  } catch (error) {
    log.error({ err: error }, "Failed to prune data");
  }
}
