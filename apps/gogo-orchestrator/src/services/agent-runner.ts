import { execute, queryOne } from "@devkit/duckdb";
import type { JobStatus } from "@devkit/gogo-shared";
import { getConn } from "../db/index.js";
import type { DbJob, DbRepository } from "../db/schema.js";
import { emitLog, type LogState, updateJobStatus } from "../utils/job-logging.js";
import { broadcast } from "../ws/handler.js";
import type { GitConfig } from "./git.js";
import { createWorktree, ensureBaseClone, fetchUpdates } from "./git.js";
import { toGitConfigFromRepo } from "./settings-helper.js";

// Track active job runs
const activeRuns = new Map<string, { cancelled: boolean }>();

async function transitionToFailed(
  jobId: string,
  fromStatus: JobStatus,
  reason: string,
  logState: LogState,
): Promise<void> {
  await emitLog(jobId, "stderr", reason, logState);
  await updateJobStatus(jobId, "failed", fromStatus, reason, {
    failure_reason: reason,
  });
}

export async function startJobRun(jobId: string): Promise<{ success: boolean; error?: string }> {
  // Check if already running in this process
  if (activeRuns.has(jobId)) {
    return { success: false, error: "Job run already in progress" };
  }

  const conn = getConn();
  const now = new Date().toISOString();

  // Atomic transition: only one caller can successfully claim the job
  // This prevents race conditions when multiple pollers or retries run concurrently
  await execute(conn, "UPDATE jobs SET status = ?, updated_at = ? WHERE id = ? AND status = ?", [
    "running",
    now,
    jobId,
    "queued",
  ]);

  const claimed = await queryOne<DbJob>(conn, "SELECT * FROM jobs WHERE id = ? AND status = ?", [jobId, "running"]);

  if (!claimed) {
    // Either job doesn't exist or wasn't in queued state
    const job = await queryOne<DbJob>(conn, "SELECT * FROM jobs WHERE id = ?", [jobId]);
    if (!job) {
      return { success: false, error: "Job not found" };
    }
    return {
      success: false,
      error: `Job must be in 'queued' state to start (current: ${job.status})`,
    };
  }

  const job = claimed;

  // Record the state transition event
  await execute(
    conn,
    "INSERT INTO job_events (id, job_id, event_type, from_status, to_status, message, created_at) VALUES (gen_random_uuid(), ?, ?, ?, ?, ?, ?)",
    [jobId, "state_change", "queued", "running", "Starting workspace setup...", now],
  );

  broadcast({ type: "job:updated", payload: job });

  // Get git config - prefer repository settings, fall back to legacy workspace settings
  // If this fails, we need to revert the job to failed state since we already claimed it
  let gitConfig: GitConfig;

  const revertToFailed = async (reason: string) => {
    const failNow = new Date().toISOString();
    await execute(conn, "UPDATE jobs SET status = ?, failure_reason = ?, updated_at = ? WHERE id = ?", [
      "failed",
      reason,
      failNow,
      jobId,
    ]);
    await execute(
      conn,
      "INSERT INTO job_events (id, job_id, event_type, from_status, to_status, message, created_at) VALUES (gen_random_uuid(), ?, ?, ?, ?, ?, ?)",
      [jobId, "state_change", "running", "failed", reason, failNow],
    );
    const failedJob = await queryOne<DbJob>(conn, "SELECT * FROM jobs WHERE id = ?", [jobId]);
    if (failedJob) {
      broadcast({ type: "job:updated", payload: failedJob });
    }
  };

  if (!job.repository_id) {
    await revertToFailed("Job has no associated repository");
    return { success: false, error: "Job has no associated repository" };
  }

  // Use repository-specific settings
  const repo = await queryOne<DbRepository>(conn, "SELECT * FROM repositories WHERE id = ?", [job.repository_id]);

  if (!repo) {
    await revertToFailed("Repository not found");
    return { success: false, error: "Repository not found" };
  }

  if (!repo.is_active) {
    await revertToFailed("Repository is not active");
    return { success: false, error: "Repository is not active" };
  }

  gitConfig = toGitConfigFromRepo({
    owner: repo.owner,
    name: repo.name,
    githubToken: repo.github_token,
    workdirPath: repo.workdir_path,
    baseBranch: repo.base_branch,
  });
  const runState = { cancelled: false };
  activeRuns.set(jobId, runState);

  const logState: LogState = { sequence: 0 };

  // Start the async workflow
  (async () => {
    try {
      // Already transitioned to running atomically above
      await emitLog(jobId, "system", "Starting workspace setup...", logState);

      if (runState.cancelled) return;

      // Ensure base clone
      await emitLog(jobId, "system", `Ensuring base repository clone at ${gitConfig.workdir}/.repo`, logState);
      try {
        await ensureBaseClone(gitConfig);
        await emitLog(jobId, "stdout", "Base repository ready", logState);
      } catch (error: unknown) {
        const err = error as Error;
        await transitionToFailed(jobId, "running", `Failed to clone repository: ${err.message}`, logState);
        return;
      }

      if (runState.cancelled) return;

      // Fetch updates
      await emitLog(jobId, "system", "Fetching latest updates from origin...", logState);
      try {
        await fetchUpdates(gitConfig);
        await emitLog(jobId, "stdout", "Repository updated", logState);
      } catch (error: unknown) {
        const err = error as Error;
        await transitionToFailed(jobId, "running", `Failed to fetch updates: ${err.message}`, logState);
        return;
      }

      if (runState.cancelled) return;

      // Create worktree
      const worktreeLabel = job.issue_number < 0 ? "manual job" : `issue #${job.issue_number}`;
      await emitLog(jobId, "system", `Creating worktree for ${worktreeLabel}...`, logState);
      try {
        const { worktreePath, branch } = await createWorktree(gitConfig, job.issue_number, job.issue_title, job.id);

        // Update job with worktree info
        const updateNow = new Date().toISOString();
        await execute(conn, "UPDATE jobs SET branch = ?, worktree_path = ?, updated_at = ? WHERE id = ?", [
          branch,
          worktreePath,
          updateNow,
          jobId,
        ]);

        const updated = await queryOne<DbJob>(conn, "SELECT * FROM jobs WHERE id = ?", [jobId]);
        if (updated) {
          broadcast({ type: "job:updated", payload: updated });
        }

        await emitLog(jobId, "stdout", `Branch: ${branch}`, logState);
        await emitLog(jobId, "system", `Workspace ready at ${worktreePath}`, logState);
      } catch (error: unknown) {
        const err = error as Error;
        await transitionToFailed(jobId, "running", `Failed to create worktree: ${err.message}`, logState);
        return;
      }

      // Workspace is ready - job stays in 'running' state
      // Agent execution is started separately via /api/jobs/:id/start-agent
      await emitLog(jobId, "system", "Workspace setup complete. Ready for agent execution.", logState);
    } catch (error: unknown) {
      const err = error as Error;
      await transitionToFailed(jobId, "running", `Unexpected error: ${err.message}`, logState);
    } finally {
      activeRuns.delete(jobId);
    }
  })();

  return { success: true };
}

export function stopJobRun(jobId: string): boolean {
  const runState = activeRuns.get(jobId);
  if (!runState) return false;

  runState.cancelled = true;
  activeRuns.delete(jobId);
  return true;
}

export function isRunning(jobId: string): boolean {
  return activeRuns.has(jobId);
}
