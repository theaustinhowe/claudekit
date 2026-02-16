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

export interface RunClaudeOptions {
  cwd: string;
  prompt: string;
  allowedTools?: string;
  disallowedTools?: string;
  onProgress: (info: ProgressInfo) => void;
  timeoutMs?: number;
  signal?: AbortSignal;
  onPid?: (pid: number) => void;
  /** Warn if no output after this many ms (default: 30000) */
  spawnHealthTimeoutMs?: number;
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
