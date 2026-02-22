// ---------------------------------------------------------------------------
// Base types shared across all apps (used by @claudekit/ui session components)
// ---------------------------------------------------------------------------

export type SessionStatusBase = "pending" | "running" | "done" | "error" | "cancelled";

export interface SessionRowBase {
  id: string;
  session_type: string;
  status: SessionStatusBase;
  label: string;
  progress: number;
  phase: string | null;
  pid: number | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  error_message: string | null;
  context_type?: string | null;
  context_id?: string | null;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Session event types
// ---------------------------------------------------------------------------

export type SessionEventType = "init" | "progress" | "log" | "chunk" | "done" | "error" | "cancelled" | "heartbeat";

export interface SessionEvent {
  type: SessionEventType;
  message?: string;
  progress?: number;
  phase?: string;
  log?: string;
  logType?: string;
  chunk?: string;
  // biome-ignore lint/suspicious/noExplicitAny: app-specific data
  data?: any;
}

export type SessionRunner = (ctx: {
  onProgress: (event: SessionEvent) => void;
  signal: AbortSignal;
  sessionId: string;
}) => Promise<{ result?: Record<string, unknown> }>;

export type SessionSubscriber = (event: SessionEvent) => void;

export interface LiveSession {
  id: string;
  sessionType: string;
  status: string;
  label: string;
  events: SessionEvent[];
  subscribers: Set<SessionSubscriber>;
  abortController: AbortController;
  cleanupFn: (() => Promise<void>) | null;
  completionPromise: Promise<void>;
  pendingLogs: Array<{ log: string; logType: string }>;
  logFlushTimer: ReturnType<typeof setInterval> | null;
}

/**
 * Persistence callbacks injected by each app.
 * This decouples the session manager from any specific DB layer.
 */
export interface SessionPersistence {
  /** Load a session record by ID. Returns null if not found. */
  loadSession: (sessionId: string) => Promise<{
    session_type: string;
    label: string;
    status: string;
    pid?: number | null;
  } | null>;

  /** Update fields on a session record. */
  updateSession: (
    sessionId: string,
    updates: Partial<{
      status: string;
      started_at: string;
      completed_at: string;
      progress: number;
      phase: string;
      pid: number;
      error_message: string;
      result_json: string;
    }>,
  ) => Promise<void>;

  /** Persist a batch of log entries. */
  persistLogs: (sessionId: string, logs: Array<{ log: string; logType: string }>) => Promise<void>;
}

export interface SessionManagerConfig {
  persistence: SessionPersistence;
  /** Ring buffer size for in-memory events (default: 500) */
  eventBufferSize?: number;
  /** Log flush interval in ms (default: 2000) */
  logFlushIntervalMs?: number;
  /** Use globalThis caching to survive Next.js HMR (default: true) */
  useGlobalCache?: boolean;
}

export interface SessionManager {
  startSession: (sessionId: string, runner: SessionRunner) => Promise<LiveSession>;
  cancelSession: (sessionId: string) => Promise<boolean>;
  subscribe: (sessionId: string, callback: SessionSubscriber) => (() => void) | null;
  getLiveSession: (sessionId: string) => LiveSession | undefined;
  setCleanupFn: (sessionId: string, fn: () => Promise<void>) => void;
  setSessionPid: (sessionId: string, pid: number) => Promise<void>;
  /** Emit an event into a live session from external code (ring buffer + fan-out + log batching). */
  emitEvent: (sessionId: string, event: SessionEvent) => boolean;
}
