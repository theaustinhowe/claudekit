import { setLastPollTime } from "../api/health.js";
import { parseJsonField, queryOne } from "../db/helpers.js";
import { getConn } from "../db/index.js";
import type { DbSetting } from "../db/schema.js";
import { createServiceLogger } from "../utils/logger.js";
import { getAllRateLimitInfo } from "./github/index.js";
import { emitHealthEvent } from "./health-events.js";
import { pollForLabeledIssues } from "./issue-polling.js";
import { syncAllIssues } from "./issue-sync.js";
import { pollQueuedJobs } from "./job-auto-start.js";
import { pollNeedsInfoJobs } from "./needs-info.js";
import { pollPlanApprovalJobs } from "./plan-approval.js";
import { pollReadyToPrJobs } from "./pr-flow.js";
import { pollPrReviewingJobs } from "./pr-reviewing.js";
import { checkStaleJobs } from "./stale-job-monitor.js";

const log = createServiceLogger("polling");

const DEFAULT_POLL_INTERVAL_MS = 60000; // 60 seconds
const RATE_LIMIT_SLOWDOWN_MULTIPLIER = 3; // 3x slower when rate limit is low

let pollTimeout: NodeJS.Timeout | null = null;
let isPolling = false;
let pollingStopped = false;

// Throttle state tracking for UI visibility
interface ThrottleState {
  isThrottled: boolean;
  reason?: string;
  resetAt?: Date;
}

let currentThrottleState: ThrottleState = { isThrottled: false };
let previousThrottleState: ThrottleState = { isThrottled: false };

/**
 * Get current throttle state for health API
 */
export function getThrottleState(): ThrottleState {
  return currentThrottleState;
}

interface PollIntervalSetting {
  ms: number;
}

async function getPollIntervalMs(): Promise<number> {
  try {
    const conn = getConn();
    const row = await queryOne<DbSetting>(
      conn,
      "SELECT * FROM settings WHERE key = ?",
      ["poll_interval_ms"],
    );

    if (row) {
      const parsed = parseJsonField<PollIntervalSetting>(row.value, { ms: 0 });
      if (typeof parsed.ms === "number" && parsed.ms >= 5000) {
        return parsed.ms;
      }
    }
  } catch {
    // Ignore errors, use default
  }
  return DEFAULT_POLL_INTERVAL_MS;
}

/**
 * Update throttle state and log transitions
 */
function updateThrottleState(
  rateLimitInfo: ReturnType<typeof getAllRateLimitInfo>,
): void {
  const resetAt = rateLimitInfo.lowestRemaining?.reset;

  let newState: ThrottleState;
  if (rateLimitInfo.hasCritical) {
    newState = {
      isThrottled: true,
      reason: "critical",
      resetAt,
    };
  } else if (rateLimitInfo.hasWarning) {
    newState = {
      isThrottled: true,
      reason: "warning",
      resetAt,
    };
  } else {
    newState = { isThrottled: false };
  }

  // Log state transitions (not every poll cycle)
  const stateChanged =
    previousThrottleState.isThrottled !== newState.isThrottled ||
    previousThrottleState.reason !== newState.reason;

  if (stateChanged) {
    if (newState.isThrottled) {
      const msg = `Rate limit ${newState.reason} - throttling active. Resets at: ${resetAt?.toISOString() ?? "unknown"}`;
      log.warn(
        { state: newState.reason, resetAt: resetAt?.toISOString() },
        msg,
      );
      emitHealthEvent("rate_limit_transition", msg, {
        state: newState.reason,
        resetAt: resetAt?.toISOString(),
      });
    } else if (previousThrottleState.isThrottled) {
      log.info("Rate limit recovered - throttling deactivated");
      emitHealthEvent(
        "rate_limit_transition",
        "Rate limit recovered - throttling deactivated",
        {
          state: "normal",
        },
      );
    }
    previousThrottleState = { ...currentThrottleState };
  }

  currentThrottleState = newState;
}

async function runPollCycle(): Promise<void> {
  if (isPolling) {
    log.warn("Previous poll cycle still running, skipping");
    return;
  }

  // Check rate limit status before polling
  const rateLimitInfo = getAllRateLimitInfo();

  // Update throttle state for UI visibility
  updateThrottleState(rateLimitInfo);

  if (rateLimitInfo.hasCritical) {
    const resetTime = rateLimitInfo.lowestRemaining?.reset;
    log.warn(
      { resetAt: resetTime?.toISOString() },
      "Skipping poll cycle - GitHub rate limit critical",
    );
    return;
  }

  isPolling = true;
  try {
    // Poll for NEEDS_INFO responses
    await pollNeedsInfoJobs();

    // Poll for plan approval responses
    await pollPlanApprovalJobs();

    // Poll for labeled issues to auto-create jobs
    await pollForLabeledIssues();

    // Auto-start queued jobs (respects max_parallel_jobs)
    await pollQueuedJobs();

    // Process jobs ready for PR creation
    await pollReadyToPrJobs();

    // Poll for PR review feedback (completes the automation loop)
    await pollPrReviewingJobs();

    // Sync GitHub issues and comments to local database
    await syncAllIssues();

    // Check for stale RUNNING jobs with dead processes
    await checkStaleJobs();

    // Record successful poll time for health monitoring
    setLastPollTime(new Date());
    emitHealthEvent("poll_cycle_complete", "Poll cycle completed successfully");
  } catch (error) {
    log.error({ err: error }, "Error during poll cycle");
  } finally {
    isPolling = false;
  }
}

/**
 * Get effective poll interval, accounting for rate limit status
 */
export async function getEffectivePollInterval(): Promise<number> {
  const baseInterval = await getPollIntervalMs();
  const rateLimitInfo = getAllRateLimitInfo();

  // Slow down polling when rate limit is in warning state
  if (rateLimitInfo.hasWarning && !rateLimitInfo.hasCritical) {
    const slowedInterval = baseInterval * RATE_LIMIT_SLOWDOWN_MULTIPLIER;
    log.info(
      { interval: slowedInterval },
      "Rate limit warning - slowing poll interval",
    );
    return slowedInterval;
  }

  return baseInterval;
}

/**
 * Schedule the next poll cycle using setTimeout.
 * Re-reads the effective interval each cycle so settings changes
 * and rate limit recovery take effect without restart.
 */
async function scheduleNextPoll(): Promise<void> {
  if (pollingStopped) return;

  const intervalMs = await getEffectivePollInterval();
  pollTimeout = setTimeout(async () => {
    await runPollCycle();
    await scheduleNextPoll();
  }, intervalMs);
}

/**
 * Start the polling scheduler
 */
export async function startPolling(): Promise<void> {
  if (pollTimeout) {
    log.warn("Polling already started");
    return;
  }

  pollingStopped = false;
  const intervalMs = await getEffectivePollInterval();
  log.info({ interval: intervalMs }, "Starting polling (dynamic interval)");

  // Run immediately on start
  await runPollCycle();

  // Then schedule with dynamic interval
  await scheduleNextPoll();
}

/**
 * Stop the polling scheduler
 */
export function stopPolling(): void {
  pollingStopped = true;
  if (pollTimeout) {
    clearTimeout(pollTimeout);
    pollTimeout = null;
    log.info("Stopped polling");
  }
}

/**
 * Check if polling is currently active
 */
export function isPollingActive(): boolean {
  return pollTimeout !== null && !pollingStopped;
}
