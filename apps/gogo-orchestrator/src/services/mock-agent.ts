import { execute, queryOne } from "@devkit/duckdb";
import type { JobStatus, LogStream } from "@devkit/gogo-shared";
import { getConn } from "../db/index.js";
import type { DbJob } from "../db/schema.js";
import { broadcast, sendLogToSubscribers } from "../ws/handler.js";

// Track active mock runs to prevent duplicates
const activeRuns = new Map<string, NodeJS.Timeout[]>();

interface MockAgentConfig {
  logIntervalMs: number;
  stateDelayMs: number;
}

const DEFAULT_CONFIG: MockAgentConfig = {
  logIntervalMs: 500,
  stateDelayMs: 3000,
};

// Simulated log messages for different phases
const MOCK_LOGS: {
  phase: JobStatus;
  logs: Array<{ stream: LogStream; content: string }>;
}[] = [
  {
    phase: "running",
    logs: [
      { stream: "system", content: "Agent started processing job" },
      { stream: "stdout", content: "Reading issue description..." },
      { stream: "stdout", content: "Analyzing requirements..." },
      { stream: "stdout", content: "Setting up worktree..." },
      { stream: "system", content: "Worktree created at /tmp/worktree-abc123" },
      { stream: "stdout", content: "Running initial analysis..." },
      { stream: "stdout", content: "Identifying files to modify..." },
      { stream: "stdout", content: "Found 3 relevant files" },
    ],
  },
  {
    phase: "ready_to_pr",
    logs: [
      { stream: "stdout", content: "Making changes to src/index.ts..." },
      { stream: "stdout", content: "Making changes to src/utils.ts..." },
      { stream: "stdout", content: "Running tests..." },
      { stream: "stdout", content: "All tests passed (12/12)" },
      { stream: "system", content: "Changes committed: abc1234" },
      { stream: "stdout", content: "Preparing pull request..." },
    ],
  },
  {
    phase: "pr_opened",
    logs: [
      { stream: "system", content: "Creating pull request..." },
      {
        stream: "stdout",
        content: "PR #42 created: https://github.com/example/repo/pull/42",
      },
      { stream: "stdout", content: "Waiting for CI checks..." },
      { stream: "stdout", content: "CI checks passed" },
    ],
  },
  {
    phase: "done",
    logs: [{ stream: "system", content: "Job completed successfully" }],
  },
];

async function updateJobStatus(jobId: string, newStatus: JobStatus, fromStatus: JobStatus): Promise<boolean> {
  const conn = getConn();
  const now = new Date().toISOString();

  await execute(conn, "UPDATE jobs SET status = ?, updated_at = ? WHERE id = ?", [newStatus, now, jobId]);

  const updated = await queryOne<DbJob>(conn, "SELECT * FROM jobs WHERE id = ?", [jobId]);

  if (!updated) return false;

  // Create state change event
  await execute(
    conn,
    "INSERT INTO job_events (id, job_id, event_type, from_status, to_status, message, created_at) VALUES (gen_random_uuid(), ?, ?, ?, ?, ?, ?)",
    [jobId, "state_change", fromStatus, newStatus, `Mock agent transitioned job to ${newStatus}`, now],
  );

  // Broadcast job update to all clients
  broadcast({ type: "job:updated", payload: updated });

  return true;
}

async function emitLog(jobId: string, stream: LogStream, content: string, sequence: number) {
  const conn = getConn();

  // Insert log into database
  await execute(
    conn,
    "INSERT INTO job_logs (id, job_id, stream, content, sequence, created_at) VALUES (gen_random_uuid(), ?, ?, ?, ?, ?)",
    [jobId, stream, content, sequence, new Date().toISOString()],
  );

  // Send to WebSocket subscribers
  sendLogToSubscribers(jobId, { stream, content, sequence });
}

export async function startMockRun(
  jobId: string,
  config: Partial<MockAgentConfig> = {},
): Promise<{ success: boolean; error?: string }> {
  const { logIntervalMs, stateDelayMs } = { ...DEFAULT_CONFIG, ...config };

  // Check if already running
  if (activeRuns.has(jobId)) {
    return {
      success: false,
      error: "Mock run already in progress for this job",
    };
  }

  // Get current job state
  const conn = getConn();
  const job = await queryOne<DbJob>(conn, "SELECT * FROM jobs WHERE id = ?", [jobId]);
  if (!job) {
    return { success: false, error: "Job not found" };
  }

  if (job.status !== "queued") {
    return {
      success: false,
      error: `Job must be in 'queued' state to start mock run (current: ${job.status})`,
    };
  }

  const timeouts: NodeJS.Timeout[] = [];
  activeRuns.set(jobId, timeouts);

  let sequence = 0;
  let currentDelay = 0;

  // Schedule the state transitions and logs
  const states: JobStatus[] = ["running", "ready_to_pr", "pr_opened", "done"];
  let previousStatus: JobStatus = "queued";

  for (const phase of MOCK_LOGS) {
    const phaseData = MOCK_LOGS.find((p) => p.phase === phase.phase);
    if (!phaseData) continue;

    // Schedule state transition
    if (states.includes(phase.phase)) {
      const fromStatus = previousStatus;
      const toStatus = phase.phase;
      const transitionDelay = currentDelay;

      const timeout = setTimeout(async () => {
        // Check if cancelled
        if (!activeRuns.has(jobId)) return;

        const currentJob = await queryOne<DbJob>(conn, "SELECT * FROM jobs WHERE id = ?", [jobId]);
        if (
          !currentJob ||
          currentJob.status === "paused" ||
          currentJob.status === "failed" ||
          currentJob.status === "done"
        ) {
          stopMockRun(jobId);
          return;
        }

        await updateJobStatus(jobId, toStatus, fromStatus);
      }, transitionDelay);

      timeouts.push(timeout);
      previousStatus = phase.phase;
      currentDelay += 500; // Small delay after state change
    }

    // Schedule logs for this phase
    for (const log of phaseData.logs) {
      const logSequence = sequence++;
      const logDelay = currentDelay;

      const timeout = setTimeout(async () => {
        // Check if cancelled
        if (!activeRuns.has(jobId)) return;

        const currentJob = await queryOne<DbJob>(conn, "SELECT * FROM jobs WHERE id = ?", [jobId]);
        if (
          !currentJob ||
          currentJob.status === "paused" ||
          currentJob.status === "failed" ||
          currentJob.status === "done"
        ) {
          stopMockRun(jobId);
          return;
        }

        await emitLog(jobId, log.stream, log.content, logSequence);
      }, logDelay);

      timeouts.push(timeout);
      currentDelay += logIntervalMs;
    }

    currentDelay += stateDelayMs;
  }

  // Schedule cleanup
  const cleanupTimeout = setTimeout(() => {
    stopMockRun(jobId);
  }, currentDelay + 1000);
  timeouts.push(cleanupTimeout);

  return { success: true };
}

export function stopMockRun(jobId: string): boolean {
  const timeouts = activeRuns.get(jobId);
  if (!timeouts) return false;

  for (const timeout of timeouts) {
    clearTimeout(timeout);
  }
  activeRuns.delete(jobId);
  return true;
}

export function isRunning(jobId: string): boolean {
  return activeRuns.has(jobId);
}
