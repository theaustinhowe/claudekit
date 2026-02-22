import { execute, queryAll } from "@claudekit/duckdb";
import { getDb } from "../db/index.js";
import { createServiceLogger } from "../utils/logger.js";

const log = createServiceLogger("process-manager");

interface ProcessInfo {
  jobId: string;
  pid: number;
  startedAt: Date;
}

/**
 * Check if a process exists by sending signal 0
 * Returns true if the process exists, false otherwise
 */
function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Store PID in database when spawning a process
 */
export async function registerProcess(jobId: string, pid: number): Promise<void> {
  const conn = await getDb();
  const now = new Date().toISOString();
  await execute(conn, "UPDATE jobs SET process_pid = ?, process_started_at = ?, updated_at = ? WHERE id = ?", [
    pid,
    now,
    now,
    jobId,
  ]);
}

/**
 * Remove PID from database when process exits
 */
export async function unregisterProcess(jobId: string): Promise<void> {
  const conn = await getDb();
  const now = new Date().toISOString();
  await execute(conn, "UPDATE jobs SET process_pid = NULL, process_started_at = NULL, updated_at = ? WHERE id = ?", [
    now,
    jobId,
  ]);
}

/**
 * Find processes that have PIDs in DB but status is not 'running'
 * This happens when orchestrator crashes mid-run
 */
export async function findOrphanedProcesses(): Promise<ProcessInfo[]> {
  const conn = await getDb();
  const jobsWithPids = await queryAll<{
    id: string;
    process_pid: number | null;
    process_started_at: string | null;
  }>(conn, "SELECT id, process_pid, process_started_at FROM jobs WHERE process_pid IS NOT NULL");

  const orphaned: ProcessInfo[] = [];

  for (const job of jobsWithPids) {
    if (job.process_pid !== null && job.process_started_at !== null) {
      orphaned.push({
        jobId: job.id,
        pid: job.process_pid,
        startedAt: new Date(job.process_started_at),
      });
    }
  }

  return orphaned;
}

/**
 * Safe termination: SIGTERM -> wait 5s -> SIGKILL
 * Returns true if process was terminated, false if it didn't exist
 */
export async function safeTerminate(pid: number): Promise<boolean> {
  // Check if process exists
  if (!processExists(pid)) {
    return false;
  }

  // Send SIGTERM
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // Process may have already exited
    return false;
  }

  // Wait up to 5 seconds for graceful termination
  const startTime = Date.now();
  const timeout = 5000;

  while (Date.now() - startTime < timeout) {
    if (!processExists(pid)) {
      return true;
    }
    // Wait 100ms before checking again
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  // Process still running, send SIGKILL
  try {
    process.kill(pid, "SIGKILL");
    return true;
  } catch {
    // Process may have exited between check and kill
    return !processExists(pid);
  }
}

/**
 * Cleanup all orphaned processes found in DB
 */
export async function cleanupOrphanedProcesses(): Promise<{
  found: number;
  terminated: number;
  failed: number;
}> {
  const orphaned = await findOrphanedProcesses();
  let terminated = 0;
  let failed = 0;

  for (const proc of orphaned) {
    log.info({ jobId: proc.jobId, pid: proc.pid }, "Found orphaned process");

    const success = await safeTerminate(proc.pid);
    if (success) {
      log.info({ pid: proc.pid }, "Terminated orphaned process");
      terminated++;
    } else {
      log.info({ pid: proc.pid }, "Failed to terminate or already dead");
      failed++;
    }

    // Clear the PID reference regardless of termination result
    await unregisterProcess(proc.jobId);
  }

  return {
    found: orphaned.length,
    terminated,
    failed,
  };
}

/**
 * Clear stale PID references (processes that don't exist anymore)
 * Returns the number of stale references cleared
 */
export async function clearStalePidReferences(): Promise<number> {
  const conn = await getDb();
  const jobsWithPids = await queryAll<{
    id: string;
    process_pid: number | null;
  }>(conn, "SELECT id, process_pid FROM jobs WHERE process_pid IS NOT NULL");

  let cleared = 0;

  for (const job of jobsWithPids) {
    if (job.process_pid !== null && !processExists(job.process_pid)) {
      log.info({ jobId: job.id, pid: job.process_pid }, "Clearing stale PID reference");
      await unregisterProcess(job.id);
      cleared++;
    }
  }

  return cleared;
}
