export type SessionStatus = "pending" | "running" | "done" | "error" | "cancelled";

export type SessionType =
  | "analyze-project"
  | "generate-outline"
  | "generate-data-plan"
  | "generate-scripts"
  | "generate-voiceover"
  | "voiceover-audio"
  | "recording"
  | "final-merge"
  | "edit-content"
  | "chat";

export interface SessionEvent {
  type: "init" | "progress" | "log" | "chunk" | "done" | "error" | "cancelled";
  message?: string;
  progress?: number;
  phase?: string;
  data?: Record<string, unknown>;
  log?: string;
  logType?: "tool" | "thinking" | "status";
  chunk?: string;
}

export type SessionRunner = (ctx: {
  onProgress: (event: SessionEvent) => void;
  signal: AbortSignal;
  sessionId: string;
}) => Promise<{ result?: Record<string, unknown> }>;

export interface SessionRow {
  [key: string]: string | number | null;
  id: string;
  session_type: string;
  status: string;
  label: string;
  project_path: string | null;
  run_id: string | null;
  pid: number | null;
  progress: number | null;
  phase: string | null;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  result_json: string | null;
  created_at: string;
}

export interface SessionLogRow {
  [key: string]: string | number | null;
  id: number;
  session_id: string;
  log: string;
  log_type: string;
  created_at: string;
}
