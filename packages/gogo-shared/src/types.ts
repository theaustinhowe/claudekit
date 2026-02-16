// Agent provider types
export type AgentProviderType = "claude-code" | "openai-codex";

// Job source - distinguishes GitHub-issue-based jobs from manually created ones
export type JobSource = "github_issue" | "manual";

// Job states per AGENTS.md
// Extended with pr_reviewing for automated PR feedback loop
// Extended with planning/awaiting_plan_approval for plan-first workflow
export type JobStatus =
  | "queued"
  | "planning" // Agent is analyzing & creating an implementation plan
  | "awaiting_plan_approval" // Plan posted, waiting for human approval
  | "running"
  | "needs_info"
  | "ready_to_pr"
  | "pr_opened"
  | "pr_reviewing" // Agent is monitoring PR for review comments and will respond/fix
  | "paused"
  | "failed"
  | "done";

export type JobEventType =
  | "state_change"
  | "message"
  | "error"
  | "github_sync"
  | "user_action"
  | "needs_info_response"
  | "plan_submitted"
  | "plan_approved";

export type LogStream = "stdout" | "stdout:tool" | "stdout:thinking" | "stdout:content" | "stderr" | "system";

// Claude Code inject modes
export type InjectMode = "immediate" | "queued";

export interface Repository {
  id: string;
  owner: string;
  name: string;
  displayName: string | null;
  githubToken: string;
  baseBranch: string;
  triggerLabel: string;
  workdirPath: string;
  isActive: boolean;
  autoCreateJobs: boolean;
  removeLabelAfterCreate: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Job {
  id: string;
  repositoryId: string | null;
  issueNumber: number;
  issueUrl: string;
  issueTitle: string;
  issueBody: string | null;
  status: JobStatus;
  branch: string | null;
  worktreePath: string | null;
  prNumber: number | null;
  prUrl: string | null;
  testRetryCount: number;
  lastTestOutput: string | null;
  changeSummary: string | null;
  pauseReason: string | null;
  failureReason: string | null;
  needsInfoQuestion: string | null;
  needsInfoCommentId: number | null;
  lastCheckedCommentId: number | null;
  // Claude Code session tracking
  claudeSessionId: string | null;
  // OpenAI Codex session tracking
  codexSessionId: string | null;
  injectMode: InjectMode;
  pendingInjection: string | null;
  // Process tracking
  processPid: number | null;
  processStartedAt: Date | null;
  // Agent abstraction
  agentType: string;
  agentSessionData: Record<string, unknown> | null;
  // Plan-first workflow
  planContent: string | null;
  planCommentId: number | null;
  lastCheckedPlanCommentId: number | null;
  source: JobSource;
  phase: string | null;
  progress: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface JobEvent {
  id: string;
  jobId: string;
  eventType: JobEventType;
  fromStatus: JobStatus | null;
  toStatus: JobStatus | null;
  message: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export interface JobLog {
  id: string;
  jobId: string;
  stream: LogStream;
  content: string;
  sequence: number;
  createdAt: Date;
}

// Locally cached GitHub issue
export interface Issue {
  id: string;
  repositoryId: string;
  number: number;
  title: string;
  body: string | null;
  state: string;
  htmlUrl: string;
  authorLogin: string | null;
  authorAvatarUrl: string | null;
  authorHtmlUrl: string | null;
  labels: { id: number; name: string; color: string; description: string | null }[] | null;
  githubCreatedAt: Date | null;
  githubUpdatedAt: Date | null;
  closedAt: Date | null;
  lastSyncedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Locally cached GitHub issue comment
export interface IssueComment {
  id: string;
  repositoryId: string;
  issueNumber: number;
  githubCommentId: number;
  body: string;
  htmlUrl: string;
  authorLogin: string | null;
  authorType: string | null;
  authorAvatarUrl: string | null;
  githubCreatedAt: Date | null;
  githubUpdatedAt: Date | null;
  lastSyncedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Settings remain flexible key-value
export interface SettingsEntry {
  key: string;
  value: unknown;
  updatedAt: Date;
}

// Research types
export type ResearchCategory =
  | "ui"
  | "ux"
  | "security"
  | "durability"
  | "performance"
  | "testing"
  | "accessibility"
  | "documentation";

export type ResearchSeverity = "low" | "medium" | "high" | "critical";

export type ResearchSessionStatus = "running" | "completed" | "failed" | "cancelled";

export interface ResearchSession {
  id: string;
  repositoryId: string;
  status: ResearchSessionStatus;
  focusAreas: ResearchCategory[];
  claudeSessionId: string | null;
  processPid: number | null;
  output: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ResearchSuggestion {
  id: string;
  sessionId: string;
  category: ResearchCategory;
  severity: ResearchSeverity;
  title: string;
  description: string;
  filePaths: string[] | null;
  convertedTo: string | null;
  convertedId: string | null;
  createdAt: Date;
}

// WebSocket server -> client message types
export type WsMessageType =
  | "job:updated"
  | "job:log"
  | "job:created"
  | "issue:synced"
  | "health:event"
  | "research:updated"
  | "research:suggestion"
  | "research:output"
  | "connection:established"
  | "subscribed"
  | "unsubscribed"
  | "subscribed_repo"
  | "unsubscribed_repo"
  | "pong"
  | "error";

export interface WsMessage {
  type: WsMessageType;
  payload: unknown;
}

// WebSocket client -> server message types
export type WsClientMessageType = "subscribe" | "unsubscribe" | "subscribe_repo" | "unsubscribe_repo" | "ping";

export interface WsClientMessage {
  type: WsClientMessageType;
  payload?: { jobId?: string };
}

// Pagination response wrapper
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
}

// API response types
export interface ApiResponse<T> {
  data?: T;
  error?: string;
}

// Network info for device connection
export interface NetworkInfo {
  ips: string[];
  port: number;
  wsPort: number;
}
