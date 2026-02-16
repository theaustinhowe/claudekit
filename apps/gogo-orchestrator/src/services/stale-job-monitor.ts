/**
 * Stale Job Monitor
 *
 * Detects RUNNING jobs that have had no log output for an extended period
 * and checks whether their agent process is still alive.
 * - If process is dead: transition to PAUSED
 * - If process is alive but silent: emit a system log warning
 */

import { execute, queryAll, queryOne } from "../db/helpers.js";
import { getConn } from "../db/index.js";
import type { DbJob } from "../db/schema.js";
import { broadcast, sendLogToSubscribers } from "../ws/handler.js";
import { emitHealthEvent } from "./health-events.js";

// A job is considered stale after 60 minutes without log output
const STALE_THRESHOLD_MS = 60 * 60 * 1000;

/**
 * Check if a process is alive by sending signal 0
 */
function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check for stale RUNNING jobs and take action
 */
export async function checkStaleJobs(): Promise<{
  checked: number;
  paused: number;
  warned: number;
}> {
  let checked = 0;
  let paused = 0;
  let warned = 0;

  const conn = getConn();
  const runningJobs = await queryAll<DbJob>(
    conn,
    "SELECT * FROM jobs WHERE status = ?",
    ["running"],
  );

  const now = Date.now();

  for (const job of runningJobs) {
    checked++;

    // Get the most recent log entry for this job
    const lastLog = await queryOne<{ created_at: string }>(
      conn,
      "SELECT created_at FROM job_logs WHERE job_id = ? ORDER BY sequence DESC LIMIT 1",
      [job.id],
    );

    const lastActivity = lastLog?.created_at
      ? new Date(lastLog.created_at).getTime()
      : new Date(job.updated_at).getTime();

    const silentMs = now - lastActivity;

    if (silentMs < STALE_THRESHOLD_MS) {
      continue; // Not stale yet
    }

    const silentMinutes = Math.round(silentMs / 60000);

    // Check if the agent process is still alive
    if (job.process_pid && processAlive(job.process_pid)) {
      // Process alive but silent - emit warning (only once per threshold crossing)
      const warningContent = `Agent still running but no output for ${silentMinutes} minutes (PID: ${job.process_pid})`;

      // Check if we already warned recently (within the last threshold period)
      const recentWarning = await queryOne<{ id: string; created_at: string }>(
        conn,
        "SELECT id, created_at FROM job_logs WHERE job_id = ? AND stream = ? ORDER BY sequence DESC LIMIT 1",
        [job.id, "system"],
      );

      const lastSystemLogTime = recentWarning?.created_at
        ? new Date(recentWarning.created_at).getTime()
        : 0;

      if (now - lastSystemLogTime > STALE_THRESHOLD_MS) {
        const sequence = Date.now();
        const logNow = new Date().toISOString();
        await execute(
          conn,
          "INSERT INTO job_logs (id, job_id, stream, content, sequence, created_at) VALUES (gen_random_uuid(), ?, ?, ?, ?, ?)",
          [job.id, "system", warningContent, sequence, logNow],
        );
        sendLogToSubscribers(job.id, {
          stream: "system",
          content: warningContent,
          sequence,
        });
        warned++;
      }
    } else {
      // Process is dead — transition to PAUSED
      const reason = job.process_pid
        ? `Agent process (PID: ${job.process_pid}) no longer running after ${silentMinutes} minutes of silence`
        : `No agent process found after ${silentMinutes} minutes of silence`;

      const pauseNow = new Date().toISOString();
      await execute(
        conn,
        "UPDATE jobs SET status = ?, pause_reason = ?, process_pid = NULL, process_started_at = NULL, updated_at = ? WHERE id = ?",
        ["paused", reason, pauseNow, job.id],
      );

      const updated = await queryOne<DbJob>(
        conn,
        "SELECT * FROM jobs WHERE id = ?",
        [job.id],
      );

      if (updated) {
        await execute(
          conn,
          "INSERT INTO job_events (id, job_id, event_type, from_status, to_status, message, metadata, created_at) VALUES (gen_random_uuid(), ?, ?, ?, ?, ?, ?, ?)",
          [
            job.id,
            "state_change",
            "running",
            "paused",
            reason,
            JSON.stringify({ triggeredBy: "stale_job_monitor" }),
            pauseNow,
          ],
        );

        broadcast({ type: "job:updated", payload: updated });
        paused++;

        emitHealthEvent("stale_job_detected", reason, {
          jobId: job.id,
          action: "paused",
          silentMinutes,
          processPid: job.process_pid,
        });
        console.log(`[stale-monitor] Paused stale job ${job.id} - ${reason}`);
      }
    }
  }

  return { checked, paused, warned };
}
