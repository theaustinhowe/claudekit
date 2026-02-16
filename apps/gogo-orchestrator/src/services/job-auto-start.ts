import { execute, queryAll, queryOne } from "../db/helpers.js";
import { getConn } from "../db/index.js";
import type { DbJob } from "../db/schema.js";
import { emitLog, type LogState } from "../utils/job-logging.js";
import { broadcast } from "../ws/handler.js";
import { startAgent } from "./agent-executor.js";
import { startJobRun } from "./agent-runner.js";
import { agentRegistry } from "./agents/index.js";
import { getClaudeAvailabilityError } from "./claude-code-agent.js";
import { getClaudeSettings, getCodexSettings } from "./settings-helper.js";

interface AutoStartResult {
  started: number;
  skipped: number;
  errors: string[];
}

/**
 * Transition a job to paused state with a reason (logs to job stream)
 */
async function transitionToPaused(jobId: string, reason: string, logState: LogState): Promise<void> {
  await emitLog(jobId, "stderr", `Agent failed to start: ${reason}`, logState);
  await emitLog(jobId, "system", "Job paused - check configuration and retry", logState);

  const conn = getConn();
  const now = new Date().toISOString();

  await execute(conn, "UPDATE jobs SET status = ?, pause_reason = ?, updated_at = ? WHERE id = ?", [
    "paused",
    reason,
    now,
    jobId,
  ]);

  const updated = await queryOne<DbJob>(conn, "SELECT * FROM jobs WHERE id = ?", [jobId]);

  if (updated) {
    await execute(
      conn,
      "INSERT INTO job_events (id, job_id, event_type, from_status, to_status, message, created_at) VALUES (gen_random_uuid(), ?, ?, ?, ?, ?, ?)",
      [jobId, "state_change", "running", "paused", `Agent failed to start: ${reason}`, now],
    );

    broadcast({ type: "job:updated", payload: updated });
  }
}

/**
 * Run pre-flight checks for agent availability
 * Returns null if all checks pass, or an error message if something is wrong
 */
async function runAgentPreflightChecks(agentType: string): Promise<string | null> {
  // Check if the agent type is registered
  const runner = agentRegistry.get(agentType);
  if (!runner) {
    return `Agent type '${agentType}' is not registered. Available: ${agentRegistry.getTypes().join(", ") || "none"}`;
  }

  // For Claude Code, check specific availability
  if (agentType === "claude-code") {
    const claudeError = await getClaudeAvailabilityError();
    if (claudeError) {
      return claudeError;
    }
  }

  return null;
}

/**
 * Get the current count of running jobs
 */
async function getRunningJobCount(): Promise<number> {
  const conn = getConn();
  const result = await queryOne<{ total: bigint }>(conn, "SELECT COUNT(*) as total FROM jobs WHERE status = ?", [
    "running",
  ]);

  return result ? Number(result.total) : 0;
}

/**
 * Get max parallel jobs from agent settings
 * Uses the higher of Claude or Codex settings since either could be used
 */
async function getMaxParallelJobs(): Promise<number> {
  const claudeSettings = await getClaudeSettings();
  const codexSettings = await getCodexSettings();

  // Use the configured agent's limit, defaulting to Claude's
  return Math.max(claudeSettings.max_parallel_jobs, codexSettings.max_parallel_jobs);
}

/**
 * Poll for queued jobs and auto-start them
 *
 * This function:
 * 1. Finds repositories with autoStartJobs enabled
 * 2. Gets the oldest queued jobs for those repositories
 * 3. Starts jobs up to the max_parallel_jobs limit
 * 4. For each job: sets up worktree, then starts the agent
 */
export async function pollQueuedJobs(): Promise<AutoStartResult> {
  const result: AutoStartResult = {
    started: 0,
    skipped: 0,
    errors: [],
  };

  // Get current running count and max limit
  const runningCount = await getRunningJobCount();
  const maxParallel = await getMaxParallelJobs();

  // Check if we have capacity
  if (runningCount >= maxParallel) {
    return result; // At capacity, nothing to start
  }

  const availableSlots = maxParallel - runningCount;
  const conn = getConn();

  // Get repositories with auto-start enabled
  const autoStartRepos = await queryAll<{
    id: string;
    agent_provider: string;
  }>(conn, "SELECT id, agent_provider FROM repositories WHERE is_active = true AND auto_start_jobs = true");

  if (autoStartRepos.length === 0) {
    return result;
  }

  const repoIds = autoStartRepos.map((r) => r.id);
  const repoAgentMap = new Map(autoStartRepos.map((r) => [r.id, r.agent_provider]));

  // Get queued jobs ordered by creation time (oldest first)
  const queuedJobs = await queryAll<DbJob>(
    conn,
    "SELECT * FROM jobs WHERE status = ? ORDER BY created_at ASC LIMIT ?",
    ["queued", availableSlots],
  );

  // Filter to only jobs in auto-start repos
  const eligibleJobs = queuedJobs.filter((job) => job.repository_id && repoIds.includes(job.repository_id));

  if (eligibleJobs.length === 0) {
    return result;
  }

  console.log(`[auto-start] Found ${eligibleJobs.length} queued jobs, ${availableSlots} slots available`);

  // Start each eligible job
  for (const job of eligibleJobs) {
    // Create a log state for this job to track sequence numbers
    // Start at a high number to avoid conflicts with existing logs
    const logState: LogState = { sequence: 10000 };

    // Double-check we still have capacity (in case of concurrent starts)
    const currentRunning = await getRunningJobCount();
    if (currentRunning >= maxParallel) {
      result.skipped += eligibleJobs.length - result.started;
      console.log("[auto-start] Max parallel jobs reached, stopping");
      break;
    }

    // Determine agent type early for pre-flight checks
    const repoId = job.repository_id;
    const agentType = (repoId && repoAgentMap.get(repoId)) || "claude-code";

    try {
      const jobLabel = job.issue_number < 0 ? "manual job" : `issue #${job.issue_number}`;
      const targetStatus = "planning";
      console.log(`[auto-start] Starting job ${job.id} (${jobLabel}) with ${agentType} (${targetStatus})...`);

      // Check if job already has a worktree (e.g., from a previous failed run)
      if (job.worktree_path && job.branch) {
        console.log(`[auto-start] Job ${job.id} already has worktree, transitioning to ${targetStatus}...`);
        // Transition to the target state
        // IMPORTANT: Clear claude_session_id so we start fresh, not resume an old/invalid session
        const now = new Date().toISOString();
        await execute(
          conn,
          "UPDATE jobs SET status = ?, pause_reason = NULL, claude_session_id = NULL, updated_at = ? WHERE id = ?",
          [targetStatus, now, job.id],
        );

        // Log to job stream that we're resuming with existing worktree
        await emitLog(
          job.id,
          "system",
          `Resuming job with existing worktree at ${job.worktree_path} (planning mode)`,
          logState,
        );
      } else {
        // Step 1: Start job run (worktree setup)
        const runResult = await startJobRun(job.id);

        if (!runResult.success) {
          result.errors.push(`Job ${job.id}: ${runResult.error}`);
          console.error(`[auto-start] Failed to start job run for ${job.id}: ${runResult.error}`);
          continue;
        }

        // Wait for worktree setup to complete
        // startJobRun runs async, so we need to poll for the job to have worktree_path set
        const worktreeReady = await waitForWorktree(job.id, 60000); // 60s timeout

        if (!worktreeReady) {
          const errorMsg = "Worktree setup timed out after 60 seconds";
          result.errors.push(`Job ${job.id}: ${errorMsg}`);
          console.error(`[auto-start] Worktree setup timed out for job ${job.id}`);
          await transitionToPaused(job.id, errorMsg, logState);
          continue;
        }
      }

      // Step 2: Transition to planning (startJobRun put us in running)
      {
        const currentJob = await queryOne<DbJob>(conn, "SELECT * FROM jobs WHERE id = ?", [job.id]);
        if (currentJob && currentJob.status === "running") {
          const planNow = new Date().toISOString();
          await execute(conn, "UPDATE jobs SET status = ?, updated_at = ? WHERE id = ?", ["planning", planNow, job.id]);

          await execute(
            conn,
            "INSERT INTO job_events (id, job_id, event_type, from_status, to_status, message, created_at) VALUES (gen_random_uuid(), ?, ?, ?, ?, ?, ?)",
            [job.id, "state_change", "running", "planning", "Entering planning phase", planNow],
          );

          const updatedJob = await queryOne<DbJob>(conn, "SELECT * FROM jobs WHERE id = ?", [job.id]);
          if (updatedJob) {
            broadcast({ type: "job:updated", payload: updatedJob });
          }
        }
        await emitLog(job.id, "system", "Starting agent in planning mode...", logState);
      }

      // Step 3: Run pre-flight checks before starting the agent
      await emitLog(job.id, "system", `Running pre-flight checks for ${agentType} agent...`, logState);

      const preflightError = await runAgentPreflightChecks(agentType);
      if (preflightError) {
        result.errors.push(`Job ${job.id}: ${preflightError}`);
        console.error(`[auto-start] Pre-flight check failed for ${job.id}: ${preflightError}`);
        await transitionToPaused(job.id, preflightError, logState);
        continue;
      }

      await emitLog(job.id, "system", `Pre-flight checks passed. Starting ${agentType} agent...`, logState);

      // Step 4: Start the agent
      const agentResult = await startAgent(job.id, agentType);

      if (!agentResult.success) {
        const errorMsg = agentResult.error || "Unknown agent error";
        result.errors.push(`Job ${job.id}: ${errorMsg}`);
        console.error(`[auto-start] Failed to start agent for ${job.id}: ${errorMsg}`);
        await transitionToPaused(job.id, errorMsg, logState);
        continue;
      }

      result.started++;
      console.log(`[auto-start] Successfully started job ${job.id} with ${agentType}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      result.errors.push(`Job ${job.id}: ${message}`);
      console.error(`[auto-start] Error starting job ${job.id}:`, error);

      // Transition to paused on unexpected errors too
      try {
        await transitionToPaused(job.id, message, logState);
      } catch (transitionError) {
        console.error(`[auto-start] Failed to transition job ${job.id} to paused:`, transitionError);
      }
    }
  }

  if (result.started > 0) {
    console.log(`[auto-start] Started ${result.started} jobs`);
  }

  return result;
}

/**
 * Wait for a job's worktree to be set up
 */
async function waitForWorktree(jobId: string, timeoutMs: number): Promise<boolean> {
  const startTime = Date.now();
  const pollInterval = 500; // Check every 500ms
  const conn = getConn();

  while (Date.now() - startTime < timeoutMs) {
    const job = await queryOne<DbJob>(conn, "SELECT * FROM jobs WHERE id = ?", [jobId]);

    if (!job) {
      return false; // Job was deleted
    }

    if (job.status === "failed") {
      return false; // Job failed during setup
    }

    if (job.worktree_path && job.branch) {
      return true; // Worktree is ready
    }

    // Wait before next check
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  return false; // Timed out
}
