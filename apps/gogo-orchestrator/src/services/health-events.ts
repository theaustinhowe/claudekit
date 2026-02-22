/**
 * Structured Health Events
 *
 * Lightweight event stream for operational events. Maintains an in-memory
 * ring buffer of recent events (hot path) with write-through persistence
 * to the database. On restart, the buffer is repopulated from the DB.
 *
 * Event types:
 * - poll_cycle_complete: A full poll cycle finished
 * - rate_limit_transition: Rate limit state changed (normal/warning/critical)
 * - agent_started: An agent process was started for a job
 * - agent_stopped: An agent process was stopped
 * - job_transitioned: A job changed state
 * - stale_job_detected: A stale job was detected and acted upon
 * - shutdown_initiated: Orchestrator shutdown started
 */

import { randomUUID } from "node:crypto";
import { execute, queryAll } from "@claudekit/duckdb";
import { getDb } from "../db/index.js";
import type { DbHealthEvent } from "../db/schema.js";
import { createServiceLogger } from "../utils/logger.js";
import { broadcast } from "../ws/handler.js";

const log = createServiceLogger("health-events");

type HealthEventType =
  | "poll_cycle_complete"
  | "rate_limit_transition"
  | "agent_started"
  | "agent_stopped"
  | "job_transitioned"
  | "stale_job_detected"
  | "shutdown_initiated";

interface HealthEvent {
  type: HealthEventType;
  timestamp: string;
  message: string;
  metadata?: Record<string, unknown>;
}

// Ring buffer of recent events (keep last 100)
const MAX_EVENTS = 100;
const eventBuffer: HealthEvent[] = [];

/**
 * Persist a health event to the database (fire-and-forget).
 * Errors are logged but do not affect the caller.
 */
async function persistEvent(event: HealthEvent): Promise<void> {
  const conn = await getDb();
  await execute(conn, "INSERT INTO health_events (id, type, message, metadata, created_at) VALUES (?, ?, ?, ?, ?)", [
    randomUUID(),
    event.type,
    event.message,
    event.metadata ? JSON.stringify(event.metadata) : null,
    event.timestamp,
  ]);
}

/**
 * Emit a structured health event.
 * Stores in the ring buffer, persists to DB (fire-and-forget),
 * and broadcasts to WebSocket clients.
 */
export function emitHealthEvent(type: HealthEventType, message: string, metadata?: Record<string, unknown>): void {
  const event: HealthEvent = {
    type,
    timestamp: new Date().toISOString(),
    message,
    metadata,
  };

  eventBuffer.push(event);
  if (eventBuffer.length > MAX_EVENTS) {
    eventBuffer.shift();
  }

  persistEvent(event).catch((error) => {
    log.error({ err: error }, "Failed to persist event");
  });
  broadcast({ type: "health:event", payload: event });
}

/**
 * Get recent health events.
 *
 * Reads from the in-memory ring buffer for fast access. Falls back to the
 * database if the buffer is empty (e.g. after a restart before any new events).
 *
 * @param limit Max number of events to return (default: 50)
 */
export async function getRecentHealthEvents(limit = 50): Promise<HealthEvent[]> {
  if (eventBuffer.length > 0) {
    return eventBuffer.slice(-limit);
  }

  // Buffer is empty — fall back to DB (e.g. after restart)
  try {
    const conn = await getDb();
    const rows = await queryAll<DbHealthEvent>(conn, "SELECT * FROM health_events ORDER BY created_at DESC LIMIT ?", [
      limit,
    ]);

    // Convert DB rows to HealthEvent shape (oldest first)
    return rows.reverse().map((row) => ({
      type: row.type as HealthEventType,
      timestamp: row.created_at,
      message: row.message,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    }));
  } catch (error) {
    log.error({ err: error }, "Failed to load events from database");
    return [];
  }
}
