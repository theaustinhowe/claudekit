import type { SessionRunner } from "@claudekit/session";
import { createSessionManager, SESSION_EVENT_BUFFER_SIZE, SESSION_LOG_FLUSH_INTERVAL_MS } from "@claudekit/session";
import type { SessionType } from "@/lib/types";

// ---------------------------------------------------------------------------
// createSession stays app-specific (creates DB record via server action)
// ---------------------------------------------------------------------------

export async function createSession(opts: {
  sessionType: SessionType;
  label: string;
  contextType?: string | null;
  contextId?: string | null;
  contextName?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<string> {
  const { createSessionRecord } = await import("@/lib/actions/sessions");
  return createSessionRecord(opts);
}

// ---------------------------------------------------------------------------
// Shared session manager with app-specific persistence callbacks
// ---------------------------------------------------------------------------

const manager = createSessionManager({
  persistence: {
    loadSession: async (id) => {
      const { getSessionRecord } = await import("@/lib/actions/sessions");
      const row = await getSessionRecord(id);
      if (!row) return null;
      return { session_type: row.session_type, label: row.label, status: row.status, pid: row.pid ?? null };
    },
    updateSession: async (id, updates) => {
      const { updateSessionRecord } = await import("@/lib/actions/sessions");
      await updateSessionRecord(id, updates as Parameters<typeof updateSessionRecord>[1]);
    },
    persistLogs: async (id, logs) => {
      const { insertSessionLogs } = await import("@/lib/actions/sessions");
      await insertSessionLogs(id, logs);
    },
  },
  eventBufferSize: SESSION_EVENT_BUFFER_SIZE,
  logFlushIntervalMs: SESSION_LOG_FLUSH_INTERVAL_MS,
});

export const { startSession, getLiveSession, setCleanupFn, setSessionPid } = manager;

export { manager as sessionManager };

export type { SessionRunner };
