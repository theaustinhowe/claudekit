import { randomUUID } from "node:crypto";
import { buildUpdate, execute, queryOne, withTransaction } from "@claudekit/duckdb";
import { type JobActionType, type JobEventType, type JobStatus, VALID_TRANSITIONS } from "@claudekit/gogo-shared";
import { getDb } from "../db/index.js";
import { type DbJob, JOB_JSON_FIELDS } from "../db/schema.js";
import { broadcast } from "../ws/handler.js";

interface TransitionResult {
  valid: boolean;
  error?: string;
  eventType: JobEventType;
}

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function validateTransition(from: JobStatus, to: JobStatus): TransitionResult {
  if (from === to) {
    return {
      valid: false,
      error: `Job is already in ${from} state`,
      eventType: "error",
    };
  }

  if (!canTransition(from, to)) {
    return {
      valid: false,
      error: `Cannot transition from ${from} to ${to}`,
      eventType: "error",
    };
  }

  return {
    valid: true,
    eventType: "state_change",
  };
}

interface ActionResult {
  newStatus: JobStatus | null; // null means no status change
  eventType: JobEventType;
  updates: {
    pause_reason?: string | null;
    failure_reason?: string | null;
    needs_info_question?: string | null;
  };
}

export function applyAction(
  currentStatus: JobStatus,
  action: JobActionType,
  payload?: { reason?: string; message?: string },
): ActionResult & { error?: string } {
  switch (action) {
    case "pause": {
      if (currentStatus === "paused") {
        return {
          newStatus: null,
          eventType: "error",
          updates: {},
          error: "Job is already paused",
        };
      }
      if (currentStatus === "done" || currentStatus === "failed") {
        return {
          newStatus: null,
          eventType: "error",
          updates: {},
          error: `Cannot pause a job in ${currentStatus} state`,
        };
      }
      return {
        newStatus: "paused",
        eventType: "state_change",
        updates: {
          pause_reason: payload?.reason ?? "User requested pause",
        },
      };
    }

    case "resume": {
      if (currentStatus !== "paused") {
        return {
          newStatus: null,
          eventType: "error",
          updates: {},
          error: "Can only resume a paused job",
        };
      }
      return {
        newStatus: "queued", // Resume goes to queued to be picked up again
        eventType: "state_change",
        updates: {
          pause_reason: null,
        },
      };
    }

    case "cancel": {
      if (currentStatus === "done") {
        return {
          newStatus: null,
          eventType: "error",
          updates: {},
          error: "Cannot cancel a completed job",
        };
      }
      if (currentStatus === "failed") {
        return {
          newStatus: null,
          eventType: "error",
          updates: {},
          error: "Job has already failed",
        };
      }
      return {
        newStatus: "failed",
        eventType: "state_change",
        updates: {
          failure_reason: payload?.reason ?? "Cancelled by user",
        },
      };
    }

    case "inject": {
      // Inject doesn't change status, just creates a user_action event
      if (currentStatus === "done" || currentStatus === "failed") {
        return {
          newStatus: null,
          eventType: "error",
          updates: {},
          error: `Cannot inject instructions into a ${currentStatus} job`,
        };
      }
      return {
        newStatus: null, // No status change
        eventType: "user_action",
        updates: {},
      };
    }

    case "request_info": {
      if (currentStatus !== "running") {
        return {
          newStatus: null,
          eventType: "error",
          updates: {},
          error: "Can only request info from a running job",
        };
      }
      // Note: The actual transition to needs_info is handled by enterNeedsInfo()
      // This just validates the action can be performed
      return {
        newStatus: "needs_info",
        eventType: "state_change",
        updates: {},
      };
    }

    case "retry": {
      if (currentStatus !== "failed") {
        return {
          newStatus: null,
          eventType: "error",
          updates: {},
          error: "Can only retry a failed job",
        };
      }
      return {
        newStatus: "queued",
        eventType: "state_change",
        updates: {
          failure_reason: null, // Clear the failure reason on retry
        },
      };
    }

    case "resume_with_agent": {
      // Resume directly to running state (agent will be started)
      // Allowed from paused or needs_info
      if (currentStatus !== "paused" && currentStatus !== "needs_info") {
        return {
          newStatus: null,
          eventType: "error",
          updates: {},
          error: `Can only resume with agent from paused or needs_info state (current: ${currentStatus})`,
        };
      }
      return {
        newStatus: "running",
        eventType: "user_action",
        updates: {
          pause_reason: null,
          needs_info_question: null,
        },
      };
    }

    case "force_stop": {
      // Force stop immediately terminates the agent process
      // Only allowed from running or planning state
      if (currentStatus !== "running" && currentStatus !== "planning") {
        return {
          newStatus: null,
          eventType: "error",
          updates: {},
          error: "Can only force stop a running or planning job",
        };
      }
      return {
        newStatus: "paused",
        eventType: "state_change",
        updates: {
          pause_reason: payload?.reason ?? "Stopped by user",
        },
      };
    }

    case "approve_plan": {
      if (currentStatus !== "awaiting_plan_approval") {
        return {
          newStatus: null,
          eventType: "error",
          updates: {},
          error: "Can only approve plan for a job awaiting plan approval",
        };
      }
      return {
        newStatus: "running",
        eventType: "plan_approved",
        updates: {},
      };
    }

    case "reject_plan": {
      if (currentStatus !== "awaiting_plan_approval") {
        return {
          newStatus: null,
          eventType: "error",
          updates: {},
          error: "Can only reject plan for a job awaiting plan approval",
        };
      }
      return {
        newStatus: "planning",
        eventType: "state_change",
        updates: {},
      };
    }

    default:
      return {
        newStatus: null,
        eventType: "error",
        updates: {},
        error: `Unknown action: ${action}`,
      };
  }
}

/**
 * Apply a state transition atomically within a database transaction
 * This ensures that the job update and event creation happen together or not at all
 */
export async function applyTransitionAtomic(
  jobId: string,
  toStatus: JobStatus,
  message: string,
  updates?: Record<string, unknown>,
): Promise<{ success: boolean; error?: string; job?: unknown }> {
  const conn = await getDb();

  const result = await withTransaction(conn, async (conn) => {
    // Get current job
    const job = await queryOne<DbJob>(conn, "SELECT * FROM jobs WHERE id = ?", [jobId]);

    if (!job) {
      return { success: false, error: "Job not found" };
    }

    const fromStatus = job.status as JobStatus;

    // Validate the transition
    const validation = validateTransition(fromStatus, toStatus);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    // Build the update data
    const updateData: Record<string, unknown> = {
      status: toStatus,
      ...updates,
    };

    const upd = buildUpdate("jobs", jobId, updateData, JOB_JSON_FIELDS);
    if (upd) {
      await execute(conn, upd.sql, upd.params);
    }

    // Create the event
    const now = new Date().toISOString();
    await execute(
      conn,
      "INSERT INTO job_events (id, job_id, event_type, from_status, to_status, message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [randomUUID(), jobId, validation.eventType, fromStatus, toStatus, message, now],
    );

    // Re-read updated job
    const updatedJob = await queryOne<DbJob>(conn, "SELECT * FROM jobs WHERE id = ?", [jobId]);

    return { success: true, job: updatedJob };
  });

  // Broadcast the update if successful
  if (result.success && result.job) {
    broadcast({ type: "job:updated", payload: result.job });
  }
  return result;
}

/**
 * Apply an action atomically (pause, resume, cancel, etc.)
 * This wraps the action application in a transaction
 */
export async function applyActionAtomic(
  jobId: string,
  action: JobActionType,
  payload?: { reason?: string; message?: string; mode?: string },
  metadata?: Record<string, unknown>,
): Promise<{ success: boolean; error?: string; job?: unknown }> {
  const conn = await getDb();

  const result = await withTransaction(conn, async (conn) => {
    // Get current job
    const job = await queryOne<DbJob>(conn, "SELECT * FROM jobs WHERE id = ?", [jobId]);

    if (!job) {
      return { success: false, error: "Job not found" };
    }

    // Apply the action logic
    const actionResult = applyAction(job.status as JobStatus, action, payload);

    if (actionResult.error) {
      return { success: false, error: actionResult.error };
    }

    // Build update object
    const updateData: Record<string, unknown> = {
      ...actionResult.updates,
    };

    if (actionResult.newStatus) {
      updateData.status = actionResult.newStatus;
    }

    const upd = buildUpdate("jobs", jobId, updateData, JOB_JSON_FIELDS);
    if (upd) {
      await execute(conn, upd.sql, upd.params);
    }

    // Create event with optional metadata
    const now = new Date().toISOString();
    const eventMetadata = metadata || (payload ? payload : null);
    await execute(
      conn,
      "INSERT INTO job_events (id, job_id, event_type, from_status, to_status, message, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [
        randomUUID(),
        jobId,
        actionResult.eventType,
        job.status,
        actionResult.newStatus,
        payload?.message || payload?.reason || `Action: ${action}`,
        eventMetadata ? JSON.stringify(eventMetadata) : null,
        now,
      ],
    );

    // Re-read updated job
    const updatedJob = await queryOne<DbJob>(conn, "SELECT * FROM jobs WHERE id = ?", [jobId]);

    return { success: true, job: updatedJob };
  });

  if (result.success && result.job) {
    broadcast({ type: "job:updated", payload: result.job });
  }
  return result;
}
