import { randomUUID } from "node:crypto";
import { execute, queryOne } from "@claudekit/duckdb";
import type { JobStatus, LogStream } from "@claudekit/gogo-shared";
import { getDb } from "../db/index.js";
import type { DbJob } from "../db/schema.js";
import { emitEvent, getLiveSession } from "../services/session-bridge.js";
import { broadcast, sendLogToSubscribers } from "../ws/handler.js";
import { createServiceLogger } from "./logger.js";

const log = createServiceLogger("job-logging");

export interface LogState {
  sequence: number;
}

interface LogEntry {
  jobId: string;
  stream: LogStream;
  content: string;
  sequence: number;
  createdAt: Date;
}

interface JobLogBuffer {
  pending: LogEntry[];
  ringBuffer: LogEntry[];
}

const FLUSH_INTERVAL_MS = 2000;
const RING_BUFFER_SIZE = 500;

// In-memory buffers per job (fallback for logs outside active sessions)
const jobBuffers = new Map<string, JobLogBuffer>();
let flushTimer: NodeJS.Timeout | null = null;

function getOrCreateBuffer(jobId: string): JobLogBuffer {
  let buffer = jobBuffers.get(jobId);
  if (!buffer) {
    buffer = { pending: [], ringBuffer: [] };
    jobBuffers.set(jobId, buffer);
  }
  return buffer;
}

/**
 * Emit a log entry for a job and broadcast to WebSocket subscribers.
 *
 * If the job has an active session (via @claudekit/session), the log is routed
 * through the session manager's ring buffer + batch flush. Otherwise, it falls
 * back to the local buffer (for pre-session logs like workspace setup).
 *
 * WebSocket broadcast always happens immediately regardless of routing.
 */
export async function emitLog(jobId: string, stream: LogStream, content: string, state: LogState): Promise<void> {
  const sequence = state.sequence++;

  // Try to route through the session manager if a live session exists
  const session = getLiveSession(jobId);
  if (session && (session.status === "running" || session.status === "pending")) {
    emitEvent(jobId, {
      type: "log",
      log: content,
      logType: stream,
    });
    // Still broadcast to WS immediately (session fan-out doesn't know about WS)
    sendLogToSubscribers(jobId, { stream, content, sequence });
    return;
  }

  // Fallback: local ring buffer + pending (for logs outside active sessions)
  const entry: LogEntry = {
    jobId,
    stream,
    content,
    sequence,
    createdAt: new Date(),
  };

  const buffer = getOrCreateBuffer(jobId);

  // Add to pending (for DB flush)
  buffer.pending.push(entry);

  // Add to ring buffer (for reconnection replay)
  buffer.ringBuffer.push(entry);
  if (buffer.ringBuffer.length > RING_BUFFER_SIZE) {
    buffer.ringBuffer.shift();
  }

  // Broadcast immediately to WebSocket subscribers (no latency change)
  sendLogToSubscribers(jobId, { stream, content, sequence });

  // Ensure flush timer is running
  ensureFlushTimer();
}

/**
 * Start the flush timer if not already running.
 */
function ensureFlushTimer(): void {
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    flushAllPending().catch((err) => {
      log.error({ err }, "Error flushing log buffers");
    });
  }, FLUSH_INTERVAL_MS);
}

/**
 * Flush all pending log entries to the database in batches.
 */
async function flushAllPending(): Promise<void> {
  const allPending: LogEntry[] = [];

  for (const [_jobId, buffer] of jobBuffers) {
    if (buffer.pending.length > 0) {
      allPending.push(...buffer.pending);
      buffer.pending = [];
    }
  }

  if (allPending.length === 0) return;

  try {
    const conn = await getDb();
    for (const entry of allPending) {
      await execute(
        conn,
        "INSERT INTO job_logs (id, job_id, stream, content, sequence, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        [randomUUID(), entry.jobId, entry.stream, entry.content, entry.sequence, entry.createdAt.toISOString()],
      );
    }
  } catch (error) {
    log.error({ err: error, count: allPending.length }, "Failed to batch-insert log entries");
  }
}

/**
 * Get the ring buffer entries for a job (for reconnection replay).
 * Checks the session's event buffer first, falls back to local buffer.
 * Returns entries with sequence > lastSequence if provided.
 */
export function getRingBuffer(jobId: string, lastSequence?: number): LogEntry[] {
  // Check if there's a live session with buffered events
  const session = getLiveSession(jobId);
  if (session && session.events.length > 0) {
    // Convert session events to LogEntry format
    const sessionEntries: LogEntry[] = session.events
      .filter((e: { log?: string }) => e.log)
      .map((e: { log?: string; logType?: string }, i: number) => ({
        jobId,
        stream: (e.logType || "system") as LogStream,
        content: e.log as string,
        sequence: i,
        createdAt: new Date(),
      }));

    if (lastSequence !== undefined) {
      return sessionEntries.filter((entry) => entry.sequence > lastSequence);
    }
    return sessionEntries;
  }

  // Fall back to local ring buffer
  const buffer = jobBuffers.get(jobId);
  if (!buffer) return [];

  if (lastSequence !== undefined) {
    return buffer.ringBuffer.filter((entry) => entry.sequence > lastSequence);
  }
  return [...buffer.ringBuffer];
}

/**
 * Flush all pending logs and stop the flush timer.
 * Called during graceful shutdown.
 */
export async function shutdownLogBuffers(): Promise<void> {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  await flushAllPending();
}

/**
 * Update a job's status, record a state-change event, and broadcast the update.
 * Shared across agent implementations that manage their own state transitions.
 */
export async function updateJobStatus(
  jobId: string,
  newStatus: JobStatus,
  fromStatus: JobStatus,
  message: string,
  updates?: Record<string, unknown>,
): Promise<boolean> {
  const conn = await getDb();
  const now = new Date().toISOString();

  // Build dynamic SET clause
  const sets: string[] = ["status = ?", "updated_at = ?"];
  const params: unknown[] = [newStatus, now];

  if (updates) {
    for (const [key, value] of Object.entries(updates)) {
      sets.push(`${key} = ?`);
      params.push(value);
    }
  }

  params.push(jobId);
  await execute(conn, `UPDATE jobs SET ${sets.join(", ")} WHERE id = ?`, params);

  const updated = await queryOne<DbJob>(conn, "SELECT * FROM jobs WHERE id = ?", [jobId]);

  if (!updated) return false;

  await execute(
    conn,
    "INSERT INTO job_events (id, job_id, event_type, from_status, to_status, message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [randomUUID(), jobId, "state_change", fromStatus, newStatus, message, now],
  );

  broadcast({ type: "job:updated", payload: updated });

  return true;
}
