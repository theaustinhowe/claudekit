export { createSessionManager } from "./session-manager";
export type { SSEReplayCallbacks } from "./sse";
export { createSessionSSEResponse } from "./sse";
export type {
  LiveSession,
  SessionEvent,
  SessionEventType,
  SessionManager,
  SessionManagerConfig,
  SessionPersistence,
  SessionRowBase,
  SessionRunner,
  SessionStatusBase,
  SessionSubscriber,
} from "./types";

// ---------------------------------------------------------------------------
// Default session constants — single source of truth for all apps
// ---------------------------------------------------------------------------

export const SESSION_EVENT_BUFFER_SIZE = 500;
export const SESSION_LOG_FLUSH_INTERVAL_MS = 2_000;
export const SESSION_HEARTBEAT_INTERVAL_MS = 15_000;

// ---------------------------------------------------------------------------
// DB init helper — shared session reconciliation + pruning logic
// ---------------------------------------------------------------------------

/**
 * Reconcile orphaned sessions and prune old data on app startup.
 *
 * This is a thin wrapper around app-provided `execute` to avoid coupling
 * the session package to a specific DB driver. Call this from your
 * `onInit` callback after running migrations.
 *
 * - Marks orphaned running/pending sessions as error
 * - Prunes session logs older than 7 days
 * - Prunes completed sessions older than 30 days
 */
export async function reconcileSessionsOnInit(exec: (sql: string, params?: unknown[]) => Promise<void>): Promise<void> {
  const now = new Date().toISOString();

  // Reconcile orphaned sessions left in 'running' or 'pending' state
  await exec(
    "UPDATE sessions SET status = 'error', error_message = 'Process terminated unexpectedly', completed_at = ? WHERE status IN ('running', 'pending')",
    [now],
  );

  // Prune old session logs (older than 7 days)
  const logCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  await exec("DELETE FROM session_logs WHERE created_at < ?", [logCutoff]);

  // Prune old completed sessions (older than 30 days)
  const sessionCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  await exec("DELETE FROM sessions WHERE created_at < ? AND status NOT IN ('running', 'pending')", [sessionCutoff]);
}
