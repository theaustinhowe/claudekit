import { execute, queryOne } from "@devkit/duckdb";
import type { JobStatus, LogStream } from "@devkit/gogo-shared";
import { getConn } from "../db/index.js";
import type { DbJob } from "../db/schema.js";
import { broadcast, sendLogToSubscribers } from "../ws/handler.js";

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

// In-memory buffers per job
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
 * Logs are buffered in memory and batch-inserted to DB every 2 seconds.
 * WebSocket broadcast happens immediately (no latency for live viewers).
 */
export async function emitLog(jobId: string, stream: LogStream, content: string, state: LogState): Promise<void> {
  const sequence = state.sequence++;
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
      console.error("[job-logging] Error flushing log buffers:", err);
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
    const conn = getConn();
    for (const entry of allPending) {
      await execute(
        conn,
        "INSERT INTO job_logs (id, job_id, stream, content, sequence, created_at) VALUES (gen_random_uuid(), ?, ?, ?, ?, ?)",
        [entry.jobId, entry.stream, entry.content, entry.sequence, entry.createdAt.toISOString()],
      );
    }
  } catch (error) {
    console.error(`[job-logging] Failed to batch-insert ${allPending.length} log entries:`, error);
  }
}

/**
 * Get the ring buffer entries for a job (for reconnection replay).
 * Returns entries with sequence > lastSequence if provided.
 */
export function getRingBuffer(jobId: string, lastSequence?: number): LogEntry[] {
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
  const conn = getConn();
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
    "INSERT INTO job_events (id, job_id, event_type, from_status, to_status, message, created_at) VALUES (gen_random_uuid(), ?, ?, ?, ?, ?, ?)",
    [jobId, "state_change", fromStatus, newStatus, message, now],
  );

  broadcast({ type: "job:updated", payload: updated });

  return true;
}
