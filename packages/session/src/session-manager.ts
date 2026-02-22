import type {
  LiveSession,
  SessionEvent,
  SessionManager,
  SessionManagerConfig,
  SessionPersistence,
  SessionRunner,
  SessionSubscriber,
} from "./types";

/** globalThis cache shape for Next.js HMR survival */
interface GlobalSessionCache {
  __session_manager?: Map<string, LiveSession>;
}

/**
 * Create a session manager with dependency-injected persistence.
 *
 * Apps provide their own DB callbacks (loadSession, updateSession, persistLogs),
 * and the session manager handles the in-memory lifecycle, fan-out, ring buffer,
 * and batch log flushing.
 */
export function createSessionManager(config: SessionManagerConfig): SessionManager {
  const { persistence, eventBufferSize = 500, logFlushIntervalMs = 2000, useGlobalCache = true } = config;

  // Session map — optionally cached on globalThis for Next.js HMR survival
  function getSessions(): Map<string, LiveSession> {
    if (useGlobalCache) {
      const g = globalThis as GlobalSessionCache;
      if (!g.__session_manager) {
        g.__session_manager = new Map();
      }
      return g.__session_manager;
    }
    return localSessions;
  }
  const localSessions = new Map<string, LiveSession>();

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  async function flushLogs(session: LiveSession, p: SessionPersistence): Promise<void> {
    if (session.pendingLogs.length === 0) return;
    const batch = session.pendingLogs.splice(0);
    try {
      await p.persistLogs(session.id, batch);
    } catch {
      // DB write failed — logs are lost but session continues
    }
  }

  function fanOut(session: LiveSession, event: SessionEvent): void {
    // Ring buffer
    session.events.push(event);
    if (session.events.length > eventBufferSize) {
      session.events.shift();
    }

    // Collect logs for batch persistence
    if (event.log) {
      session.pendingLogs.push({ log: event.log, logType: event.logType ?? "status" });
    }

    // Fan out to subscribers
    for (const sub of session.subscribers) {
      try {
        sub(event);
      } catch {
        // Ignore subscriber errors
      }
    }
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  async function startSession(sessionId: string, runner: SessionRunner): Promise<LiveSession> {
    const sessions = getSessions();

    // Guard against duplicate starts
    const existing = sessions.get(sessionId);
    if (existing && (existing.status === "running" || existing.status === "pending")) {
      return existing;
    }

    // Load session from DB
    const row = await persistence.loadSession(sessionId);
    if (!row) throw new Error(`Session ${sessionId} not found`);

    const abortController = new AbortController();

    const session: LiveSession = {
      id: sessionId,
      sessionType: row.session_type,
      status: "running",
      label: row.label,
      events: [],
      subscribers: new Set(),
      abortController,
      cleanupFn: null,
      completionPromise: Promise.resolve(),
      pendingLogs: [],
      logFlushTimer: null,
    };

    // Start periodic log flushing
    session.logFlushTimer = setInterval(() => {
      flushLogs(session, persistence);
    }, logFlushIntervalMs);

    // Update DB to running
    const startedAt = new Date().toISOString();
    await persistence.updateSession(sessionId, { status: "running", started_at: startedAt });

    // Send init event
    fanOut(session, {
      type: "init",
      message: `Starting ${row.label}`,
      data: { sessionType: row.session_type, label: row.label },
    });

    // Execute runner in background
    session.completionPromise = (async () => {
      try {
        const { result } = await runner({
          onProgress: (event) => {
            if (event.progress !== undefined) session.status = "running";
            fanOut(session, event);

            if (event.progress !== undefined || event.phase) {
              persistence
                .updateSession(sessionId, {
                  progress: event.progress ?? undefined,
                  phase: event.phase ?? undefined,
                })
                .catch(() => {});
            }
          },
          signal: abortController.signal,
          sessionId,
        });

        if (session.logFlushTimer) clearInterval(session.logFlushTimer);
        session.logFlushTimer = null;
        await flushLogs(session, persistence);

        session.status = "done";
        const completedAt = new Date().toISOString();
        await persistence.updateSession(sessionId, {
          status: "done",
          progress: 100,
          completed_at: completedAt,
          result_json: JSON.stringify(result ?? {}),
        });

        fanOut(session, { type: "done", progress: 100, data: result });
      } catch (err) {
        if (session.logFlushTimer) clearInterval(session.logFlushTimer);
        session.logFlushTimer = null;
        await flushLogs(session, persistence);

        const isAbort = err instanceof DOMException && err.name === "AbortError";

        if (isAbort) {
          session.status = "cancelled";
          const completedAt = new Date().toISOString();
          await persistence.updateSession(sessionId, {
            status: "cancelled",
            completed_at: completedAt,
            error_message: "Cancelled by user",
          });
          fanOut(session, { type: "cancelled", message: "Session cancelled" });
        } else {
          const errorMsg = err instanceof Error ? err.message : String(err);
          session.status = "error";
          const completedAt = new Date().toISOString();
          await persistence.updateSession(sessionId, {
            status: "error",
            completed_at: completedAt,
            error_message: errorMsg,
          });
          fanOut(session, { type: "error", message: errorMsg });
        }

        if (session.cleanupFn) {
          try {
            await session.cleanupFn();
          } catch {
            // Ignore cleanup errors
          }
        }
      } finally {
        session.subscribers.clear();
      }
    })();

    sessions.set(sessionId, session);
    return session;
  }

  async function cancelSession(sessionId: string): Promise<boolean> {
    const session = getSessions().get(sessionId);

    if (session && session.status === "running") {
      session.abortController.abort();
      return true;
    }

    // Fallback: orphaned session with no in-memory LiveSession
    const record = await persistence.loadSession(sessionId);
    if (!record || (record.status !== "running" && record.status !== "pending")) {
      return false;
    }

    if (record.pid) {
      try {
        process.kill(record.pid, "SIGTERM");
      } catch {
        // PID already gone
      }
    }

    await persistence.updateSession(sessionId, {
      status: "cancelled",
      completed_at: new Date().toISOString(),
      error_message: "Cancelled (orphaned session)",
    });
    return true;
  }

  function subscribe(sessionId: string, callback: SessionSubscriber): (() => void) | null {
    const session = getSessions().get(sessionId);
    if (!session) return null;

    // Replay buffered events
    for (const event of session.events) {
      try {
        callback(event);
      } catch {
        // Ignore replay errors
      }
    }

    if (session.status !== "running" && session.status !== "pending") {
      return () => {};
    }

    session.subscribers.add(callback);
    return () => {
      session.subscribers.delete(callback);
    };
  }

  function getLiveSession(sessionId: string): LiveSession | undefined {
    return getSessions().get(sessionId);
  }

  function setCleanupFn(sessionId: string, fn: () => Promise<void>): void {
    const session = getSessions().get(sessionId);
    if (session) {
      session.cleanupFn = fn;
    }
  }

  async function setSessionPid(sessionId: string, pid: number): Promise<void> {
    const session = getSessions().get(sessionId);
    if (session) {
      await persistence.updateSession(sessionId, { pid }).catch(() => {});
    }
  }

  function emitEvent(sessionId: string, event: SessionEvent): boolean {
    const session = getSessions().get(sessionId);
    if (!session || (session.status !== "running" && session.status !== "pending")) return false;
    fanOut(session, event);
    return true;
  }

  return {
    startSession,
    cancelSession,
    subscribe,
    getLiveSession,
    setCleanupFn,
    setSessionPid,
    emitEvent,
  };
}
