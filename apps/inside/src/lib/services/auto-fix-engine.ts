import { createHash } from "node:crypto";
import { saveAutoFixRun, updateAutoFixRun } from "@/lib/actions/auto-fix";
import type { AutoFixRun, AutoFixState, AutoFixStatus } from "@/lib/types";
import { onLog } from "./dev-server-manager";
import { createSession, startSession, subscribe as subscribeSession } from "./session-manager";
import { createAutoFixRunner } from "./session-runners/auto-fix";

// --- Error detection patterns ---
const ERROR_PATTERNS = [
  /error TS\d+/,
  /SyntaxError:/,
  /Module not found/,
  /TypeError:/,
  /ReferenceError:/,
  /\[vite\].*error/i,
  /Transform failed/,
  /Failed to resolve import/,
  /Compiling .* failed/,
  /Error:.*ENOENT/,
  /Unexpected token/,
  /Cannot find module/,
  /is not a function/,
  /Cannot read propert/,
  /Unhandled Runtime Error/,
];

const MAX_RETRIES = 3;
const COOLDOWN_MS = 5 * 60_000; // 5 minutes
const MAX_CONSECUTIVE_FAILURES = 5;
const DEBOUNCE_MS = 2_000;
const CONTEXT_LINES = 50;

interface ProjectState {
  enabled: boolean;
  status: AutoFixStatus;
  currentRun: AutoFixRun | null;
  consecutiveFailures: number;
  cooldownUntil: number | null;
  errorRetries: Map<string, number>; // signature -> attempt count
  unsubscribe: (() => void) | null;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  pendingErrorLines: string[];
  logs: Array<{ log: string; logType: string }>;
  subscribers: Set<(event: AutoFixEvent) => void>;
  currentSessionId: string | null;
  projectDir: string;
}

interface AutoFixEvent {
  type: "started" | "progress" | "log" | "success" | "failed" | "cancelled" | "status_change";
  status: AutoFixStatus;
  message?: string;
  run?: AutoFixRun;
  log?: string;
  logType?: string;
}

const states = new Map<string, ProjectState>();

function getOrCreate(projectId: string, projectDir = ""): ProjectState {
  let state = states.get(projectId);
  if (!state) {
    state = {
      enabled: false,
      status: "idle",
      currentRun: null,
      consecutiveFailures: 0,
      cooldownUntil: null,
      errorRetries: new Map(),
      unsubscribe: null,
      debounceTimer: null,
      pendingErrorLines: [],
      logs: [],
      subscribers: new Set(),
      currentSessionId: null,
      projectDir,
    };
    states.set(projectId, state);
  }
  if (projectDir) state.projectDir = projectDir;
  return state;
}

function emit(state: ProjectState, event: AutoFixEvent) {
  for (const cb of state.subscribers) {
    try {
      cb(event);
    } catch {
      // ignore
    }
  }
}

function setStatus(state: ProjectState, status: AutoFixStatus) {
  state.status = status;
  emit(state, { type: "status_change", status });
}

function hashError(msg: string): string {
  // Strip line numbers, hashes, and paths to create a stable signature
  const normalized = msg
    .replace(/:\d+:\d+/g, "")
    .replace(/\b[a-f0-9]{7,40}\b/g, "")
    .replace(/\/[^\s]+/g, "<path>")
    .trim();
  return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}

function detectError(line: string): boolean {
  return ERROR_PATTERNS.some((p) => p.test(line));
}

function handleLogLine(projectId: string, line: string) {
  const state = states.get(projectId);
  if (!state || !state.enabled) return;
  if (state.status === "fixing") return; // already fixing

  // Check cooldown
  if (state.cooldownUntil && Date.now() < state.cooldownUntil) return;
  if (state.cooldownUntil && Date.now() >= state.cooldownUntil) {
    state.cooldownUntil = null;
    state.consecutiveFailures = 0;
    setStatus(state, "idle");
  }

  if (!detectError(line)) return;

  state.pendingErrorLines.push(line);
  setStatus(state, "detecting");

  // Debounce: collect error lines for 2s before triggering
  if (state.debounceTimer) clearTimeout(state.debounceTimer);
  state.debounceTimer = setTimeout(() => {
    state.debounceTimer = null;
    triggerFix(projectId);
  }, DEBOUNCE_MS);
}

async function triggerFix(projectId: string) {
  const state = states.get(projectId);
  if (!state || !state.enabled || state.status === "fixing") return;

  const errorLines = state.pendingErrorLines.splice(0);
  if (errorLines.length === 0) {
    setStatus(state, "idle");
    return;
  }

  const errorMessage = errorLines.join("\n");
  const signature = hashError(errorMessage);

  // Check retry limit for this error signature
  const attempts = state.errorRetries.get(signature) ?? 0;
  if (attempts >= MAX_RETRIES) {
    setStatus(state, "idle");
    return;
  }

  // Check consecutive failure cooldown
  if (state.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    state.cooldownUntil = Date.now() + COOLDOWN_MS;
    setStatus(state, "cooldown");
    emit(state, {
      type: "failed",
      status: "cooldown",
      message: "Too many consecutive failures. Pausing for 5 minutes.",
    });
    return;
  }

  setStatus(state, "fixing");
  state.errorRetries.set(signature, attempts + 1);
  state.logs = [];

  const runId = await saveAutoFixRun({
    projectId,
    status: "running",
    errorSignature: signature,
    errorMessage,
    attemptNumber: attempts + 1,
    logs: [],
  });

  const run: AutoFixRun = {
    id: runId,
    project_id: projectId,
    status: "running",
    error_signature: signature,
    error_message: errorMessage,
    claude_output: null,
    attempt_number: attempts + 1,
    logs_json: "[]",
    started_at: new Date().toISOString(),
    completed_at: null,
  };
  state.currentRun = run;

  emit(state, { type: "started", status: "fixing", run });

  try {
    // Create and start a session for this fix attempt
    const sessionId = await createSession({
      sessionType: "auto_fix",
      label: `Auto Fix: ${errorMessage.slice(0, 60)}`,
      contextType: "project",
      contextId: projectId,
      metadata: {
        errorMessage,
        errorSignature: signature,
        attemptNumber: attempts + 1,
        projectId,
        projectDir: state.projectDir,
        contextLines: CONTEXT_LINES,
      },
    });

    state.currentSessionId = sessionId;

    const runner = createAutoFixRunner({
      errorMessage,
      errorSignature: signature,
      attemptNumber: attempts + 1,
      projectId,
      projectDir: state.projectDir,
      contextLines: CONTEXT_LINES,
    });

    // Subscribe to session events to update engine state
    const unsubSession = subscribeSession(sessionId, (event) => {
      if (event.log) {
        const logEntry = { log: event.log, logType: event.logType ?? "status" };
        state.logs.push(logEntry);
        emit(state, {
          type: "log",
          status: "fixing",
          log: event.log,
          logType: event.logType,
          message: event.message,
        });
      } else if (event.message && event.type === "progress") {
        emit(state, { type: "progress", status: "fixing", message: event.message });
      }
    });

    // Start session and wait for completion
    const liveSession = await startSession(sessionId, runner);
    await liveSession.completionPromise;

    unsubSession?.();
    state.currentSessionId = null;

    // Check outcome from the session
    const success = liveSession.status === "done";
    const cancelled = liveSession.status === "cancelled";

    if (cancelled) {
      await updateAutoFixRun(runId, { status: "cancelled", logs: state.logs });
      run.status = "cancelled";
      run.completed_at = new Date().toISOString();
      state.currentRun = run;
      emit(state, { type: "cancelled", status: "idle", run });
      setStatus(state, "idle");
      return;
    }

    const finalStatus = success ? "success" : "failed";
    run.status = finalStatus;
    run.completed_at = new Date().toISOString();
    state.currentRun = run;

    if (success) {
      state.consecutiveFailures = 0;
      setStatus(state, "success");
      emit(state, { type: "success", status: "success", run, message: "Fix applied successfully" });
      setTimeout(() => {
        if (state.status === "success") setStatus(state, "idle");
      }, 5_000);
    } else {
      state.consecutiveFailures++;
      setStatus(state, "failed");
      emit(state, { type: "failed", status: "failed", run, message: "Fix attempt failed" });
      setTimeout(() => {
        if (state.status === "failed") setStatus(state, "idle");
      }, 5_000);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    state.consecutiveFailures++;
    state.currentSessionId = null;

    await updateAutoFixRun(runId, {
      status: "failed",
      claudeOutput: msg,
      logs: state.logs,
    });

    run.status = "failed";
    run.claude_output = msg;
    run.completed_at = new Date().toISOString();
    state.currentRun = run;

    setStatus(state, "failed");
    emit(state, { type: "failed", status: "failed", run, message: msg });
    setTimeout(() => {
      if (state.status === "failed") setStatus(state, "idle");
    }, 5_000);
  }
}

// --- Public API ---

export function enable(projectId: string, projectDir: string): void {
  const state = getOrCreate(projectId, projectDir);
  if (state.enabled) return;
  state.enabled = true;
  state.unsubscribe = onLog(projectId, (line) => handleLogLine(projectId, line));
  setStatus(state, "idle");
}

export function disable(projectId: string): void {
  const state = states.get(projectId);
  if (!state) return;
  state.enabled = false;
  state.unsubscribe?.();
  state.unsubscribe = null;
  if (state.debounceTimer) {
    clearTimeout(state.debounceTimer);
    state.debounceTimer = null;
  }
  state.pendingErrorLines.length = 0;
  setStatus(state, "idle");
}

export function cancelCurrentFix(projectId: string): void {
  const state = states.get(projectId);
  if (!state || state.status !== "fixing") return;

  // Cancel via session system
  if (state.currentSessionId) {
    import("./session-manager").then(({ cancelSession }) => {
      cancelSession(state.currentSessionId as string).catch(() => {});
    });
  }

  if (state.currentRun) {
    updateAutoFixRun(state.currentRun.id, { status: "cancelled", logs: state.logs }).catch(() => {});
    state.currentRun.status = "cancelled";
    state.currentRun.completed_at = new Date().toISOString();
    emit(state, { type: "cancelled", status: "idle", run: state.currentRun });
  }

  setStatus(state, "idle");
}

export function getState(projectId: string): AutoFixState {
  const state = states.get(projectId);
  if (!state) {
    return {
      enabled: false,
      status: "idle",
      currentRun: null,
      consecutiveFailures: 0,
      cooldownUntil: null,
      lastError: null,
    };
  }
  return {
    enabled: state.enabled,
    status: state.status,
    currentRun: state.currentRun,
    consecutiveFailures: state.consecutiveFailures,
    cooldownUntil: state.cooldownUntil ? new Date(state.cooldownUntil).toISOString() : null,
    lastError: state.currentRun?.status === "failed" ? (state.currentRun.claude_output ?? null) : null,
  };
}

export async function manualTrigger(projectId: string, errorMessage?: string): Promise<void> {
  const state = states.get(projectId);
  if (!state || !state.enabled) return;
  if (state.status === "fixing") return;

  if (errorMessage) {
    state.pendingErrorLines.push(errorMessage);
  } else {
    // Use recent logs to detect errors
    const { getLogs } = await import("./dev-server-manager");
    const logs = getLogs(projectId);
    const errorLines = logs.filter((l) => detectError(l));
    if (errorLines.length > 0) {
      state.pendingErrorLines.push(...errorLines.slice(-5));
    }
  }

  if (state.pendingErrorLines.length > 0) {
    triggerFix(projectId);
  }
}
