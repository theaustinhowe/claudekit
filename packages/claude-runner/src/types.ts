export type LogType = "tool" | "thinking" | "status";

export interface ClaudeResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export interface ProgressInfo {
  message: string;
  bytesReceived: number;
  chunk?: string;
  log?: string;
  logType?: LogType;
}

export interface ClaudeStreamEvent {
  type: string;
  // biome-ignore lint/suspicious/noExplicitAny: stream-json events have dynamic shapes
  [key: string]: any;
}

export interface ParsedEvent {
  log?: string;
  logType?: LogType;
  chunk?: string;
}

// ---------------------------------------------------------------------------
// Low-level spawn API types
// ---------------------------------------------------------------------------

export interface SpawnClaudeOptions {
  /** Working directory for the Claude process */
  cwd: string;
  /** Prompt to send via `-p` flag */
  prompt: string;
  /** Pre-assign a session ID (`--session-id`) */
  sessionId?: string;
  /** Resume an existing session (`--resume`) */
  resume?: string;
  /** Limit agentic turns (`--max-turns`) */
  maxTurns?: number;
  /** Skip permission checks (`--dangerously-skip-permissions`) */
  dangerouslySkipPermissions?: boolean;
  /** Allowed tools (`--allowedTools`) */
  allowedTools?: string;
  /** Disallowed tools (`--disallowedTools`) */
  disallowedTools?: string;
  /** Enable verbose output (`--verbose`). Defaults to true. */
  verbose?: boolean;
  /** AbortSignal — sends SIGTERM on abort */
  signal?: AbortSignal;
  /** Extra CLI args appended after all built-in flags */
  extraArgs?: string[];
  /** Additional environment variables (merged with `process.env`) */
  env?: Record<string, string>;
}

export interface ClaudeProcess {
  /** The underlying Node.js ChildProcess (null when pre-aborted) */
  child: import("node:child_process").ChildProcess | null;
  /** Process ID (undefined if spawn failed) */
  pid: number | undefined;
  /** Subscribe to parsed stream-JSON events (one per newline-delimited JSON object) */
  onEvent: (handler: (event: ClaudeStreamEvent) => void) => void;
  /** Subscribe to raw stdout lines (before JSON parsing) */
  onRawLine: (handler: (line: string) => void) => void;
  /** Subscribe to stderr data */
  onStderr: (handler: (data: string) => void) => void;
  /** Subscribe to process exit */
  onExit: (handler: (code: number | null, signal: NodeJS.Signals | null) => void) => void;
  /** Subscribe to spawn/process errors */
  onError: (handler: (error: Error) => void) => void;
  /** Send a signal to the process */
  kill: (signal?: NodeJS.Signals) => boolean;
  /** Promise that resolves when the process exits (with exit code) */
  exited: Promise<number | null>;
}

export interface RunClaudeOptions extends SpawnClaudeOptions {
  onProgress: (info: ProgressInfo) => void;
  timeoutMs?: number;
  onPid?: (pid: number) => void;
  /** Warn if no output after this many ms (default: 30000) */
  spawnHealthTimeoutMs?: number;
}
