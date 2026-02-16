import { execute, queryAll } from "@devkit/duckdb";
import { closeDatabase, getDb } from "../db/index.js";
import { shutdownLogBuffers } from "../utils/job-logging.js";
import { createServiceLogger } from "../utils/logger.js";
import { agentRegistry } from "./agents/index.js";
import { emitHealthEvent } from "./health-events.js";
import { stopPolling } from "./polling.js";

const log = createServiceLogger("shutdown");

// Track if shutdown is in progress
let isShuttingDown = false;

/**
 * Register handlers for graceful shutdown
 */
export function registerShutdownHandlers(): void {
  process.on("SIGTERM", handleShutdown);
  process.on("SIGINT", handleShutdown);
}

/**
 * Handle graceful shutdown
 */
async function handleShutdown(): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  log.info("Graceful shutdown initiated");
  emitHealthEvent("shutdown_initiated", "Graceful shutdown initiated");

  // 1. Stop polling for new work
  stopPolling();
  log.info("Stopped polling for new work");

  // 2. Stop all active agent runs (save sessions) via the registry
  const conn = await getDb();
  for (const runner of agentRegistry.getAll()) {
    const activeCount = runner.getActiveRunCount();
    if (activeCount === 0) continue;

    log.info({ activeCount, agent: runner.displayName }, "Stopping active agent runs");

    // Get all running jobs and stop each one
    const allJobs = await queryAll<{ id: string }>(conn, "SELECT id FROM jobs WHERE status = ?", ["running"]);

    for (const job of allJobs) {
      if (!runner.isRunning(job.id)) continue;
      try {
        await runner.stop(job.id, true); // save session
        log.info({ jobId: job.id, agent: runner.displayName }, "Stopped agent run");
      } catch (error) {
        log.error({ jobId: job.id, agent: runner.displayName, err: error }, "Error stopping agent run");
      }
    }
  }

  // 3. Transition RUNNING jobs to PAUSED (prevents zombie jobs if orchestrator never restarts)
  try {
    const runningJobs = await queryAll<{ id: string }>(conn, "SELECT id FROM jobs WHERE status = ?", ["running"]);

    if (runningJobs.length > 0) {
      const now = new Date().toISOString();
      await execute(conn, "UPDATE jobs SET status = ?, pause_reason = ?, updated_at = ? WHERE status = ?", [
        "paused",
        "orchestrator shutdown",
        now,
        "running",
      ]);

      for (const job of runningJobs) {
        await execute(
          conn,
          "INSERT INTO job_events (id, job_id, event_type, from_status, to_status, message, metadata, created_at) VALUES (gen_random_uuid(), ?, ?, ?, ?, ?, ?, ?)",
          [
            job.id,
            "state_change",
            "running",
            "paused",
            "Orchestrator shutdown - job paused for safety",
            JSON.stringify({ triggeredBy: "orchestrator_shutdown" }),
            now,
          ],
        );
      }

      log.info({ count: runningJobs.length }, "Transitioned running jobs to paused");
    }
  } catch (error) {
    log.error({ err: error }, "Failed to transition running jobs");
  }

  // 3.5 Flush pending log buffers before closing database
  try {
    await shutdownLogBuffers();
    log.info("Flushed pending log buffers");
  } catch (error) {
    log.error({ err: error }, "Failed to flush log buffers");
  }

  // 4. Close database connection
  await closeDatabase();
  log.info("Database connection closed");

  log.info("Shutdown complete");
  process.exit(0);
}

/**
 * Check if shutdown is currently in progress
 */
export function isShutdownInProgress(): boolean {
  return isShuttingDown;
}
