/**
 * Database row types (snake_case) and row mapper functions.
 * Migration SQL in ./migrations/ is the source of truth for table definitions.
 */

import { parseJsonField } from "@devkit/duckdb";
import type {
  Issue,
  IssueComment,
  Job,
  JobEvent,
  JobLog,
  Repository,
  ResearchSession,
  ResearchSuggestion,
  SettingsEntry,
} from "@devkit/gogo-shared";

// ---------------------------------------------------------------------------
// Raw DB row types (snake_case, matching SQL column names)
// ---------------------------------------------------------------------------

export interface DbRepository {
  id: string;
  owner: string;
  name: string;
  display_name: string | null;
  github_token: string;
  base_branch: string;
  trigger_label: string;
  workdir_path: string;
  is_active: boolean;
  auto_create_jobs: boolean;
  remove_label_after_create: boolean;
  auto_start_jobs: boolean;
  auto_create_pr: boolean;
  poll_interval_ms: number;
  test_command: string | null;
  agent_provider: string;
  branch_pattern: string;
  auto_cleanup: boolean;
  last_issue_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbJob {
  id: string;
  repository_id: string | null;
  issue_number: number;
  issue_url: string;
  issue_title: string;
  issue_body: string | null;
  status: string;
  branch: string | null;
  worktree_path: string | null;
  pr_number: number | null;
  pr_url: string | null;
  test_retry_count: number;
  last_test_output: string | null;
  change_summary: string | null;
  pause_reason: string | null;
  failure_reason: string | null;
  needs_info_question: string | null;
  needs_info_comment_id: number | null;
  last_checked_comment_id: number | null;
  last_checked_pr_review_comment_id: number | null;
  claude_session_id: string | null;
  inject_mode: string;
  pending_injection: string | null;
  process_pid: number | null;
  process_started_at: string | null;
  agent_type: string;
  agent_session_data: string | null;
  plan_content: string | null;
  plan_comment_id: number | null;
  last_checked_plan_comment_id: number | null;
  source: string;
  phase: string | null;
  progress: number | null;
  created_at: string;
  updated_at: string;
}

export interface DbJobEvent {
  id: string;
  job_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  message: string | null;
  metadata: string | null;
  created_at: string;
}

export interface DbJobLog {
  id: string;
  job_id: string;
  stream: string;
  content: string;
  sequence: number;
  created_at: string;
}

export interface DbIssue {
  id: string;
  repository_id: string;
  number: number;
  title: string;
  body: string | null;
  state: string;
  html_url: string;
  author_login: string | null;
  author_avatar_url: string | null;
  author_html_url: string | null;
  labels: string | null;
  github_created_at: string | null;
  github_updated_at: string | null;
  closed_at: string | null;
  last_synced_at: string;
  created_at: string;
  updated_at: string;
}

export interface DbIssueComment {
  id: string;
  repository_id: string;
  issue_number: number;
  github_comment_id: number;
  body: string;
  html_url: string;
  author_login: string | null;
  author_type: string | null;
  author_avatar_url: string | null;
  github_created_at: string | null;
  github_updated_at: string | null;
  last_synced_at: string;
  created_at: string;
  updated_at: string;
}

export interface DbResearchSession {
  id: string;
  repository_id: string;
  status: string;
  focus_areas: string;
  claude_session_id: string | null;
  process_pid: number | null;
  output: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbResearchSuggestion {
  id: string;
  session_id: string;
  category: string;
  severity: string;
  title: string;
  description: string;
  file_paths: string | null;
  converted_to: string | null;
  converted_id: string | null;
  created_at: string;
}

export interface DbHealthEvent {
  id: string;
  type: string;
  message: string;
  metadata: string | null;
  created_at: string;
}

export interface DbSetting {
  key: string;
  value: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// JSON field sets (for buildUpdate — these columns need JSON.stringify on write)
// ---------------------------------------------------------------------------

export const JOB_JSON_FIELDS = new Set(["agent_session_data"]);

// ---------------------------------------------------------------------------
// Row mappers: snake_case DB row → camelCase shared types
// ---------------------------------------------------------------------------

function toDate(v: string | null | undefined): Date {
  return v ? new Date(v) : new Date();
}

function toDateOrNull(v: string | null | undefined): Date | null {
  return v ? new Date(v) : null;
}

export function mapRepository(row: DbRepository): Repository {
  return {
    id: row.id,
    owner: row.owner,
    name: row.name,
    displayName: row.display_name,
    githubToken: row.github_token,
    baseBranch: row.base_branch,
    triggerLabel: row.trigger_label,
    workdirPath: row.workdir_path,
    isActive: Boolean(row.is_active),
    autoCreateJobs: Boolean(row.auto_create_jobs),
    removeLabelAfterCreate: Boolean(row.remove_label_after_create),
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
}

/** Extended repository type including fields not in shared Repository */
interface RepositoryFull extends Repository {
  autoStartJobs: boolean;
  autoCreatePr: boolean;
  pollIntervalMs: number;
  testCommand: string | null;
  agentProvider: string;
  branchPattern: string;
  autoCleanup: boolean;
  lastIssueSyncAt: Date | null;
}

export function mapRepositoryFull(row: DbRepository): RepositoryFull {
  return {
    ...mapRepository(row),
    autoStartJobs: Boolean(row.auto_start_jobs),
    autoCreatePr: Boolean(row.auto_create_pr),
    pollIntervalMs: row.poll_interval_ms,
    testCommand: row.test_command,
    agentProvider: row.agent_provider,
    branchPattern: row.branch_pattern,
    autoCleanup: Boolean(row.auto_cleanup),
    lastIssueSyncAt: toDateOrNull(row.last_issue_sync_at),
  };
}

export function mapJob(row: DbJob): Job {
  return {
    id: row.id,
    repositoryId: row.repository_id,
    issueNumber: row.issue_number,
    issueUrl: row.issue_url,
    issueTitle: row.issue_title,
    issueBody: row.issue_body,
    status: row.status as Job["status"],
    branch: row.branch,
    worktreePath: row.worktree_path,
    prNumber: row.pr_number,
    prUrl: row.pr_url,
    testRetryCount: row.test_retry_count,
    lastTestOutput: row.last_test_output,
    changeSummary: row.change_summary,
    pauseReason: row.pause_reason,
    failureReason: row.failure_reason,
    needsInfoQuestion: row.needs_info_question,
    needsInfoCommentId: row.needs_info_comment_id,
    lastCheckedCommentId: row.last_checked_comment_id,
    claudeSessionId: row.claude_session_id,
    injectMode: row.inject_mode as Job["injectMode"],
    pendingInjection: row.pending_injection,
    processPid: row.process_pid,
    processStartedAt: toDateOrNull(row.process_started_at),
    agentType: row.agent_type,
    agentSessionData: parseJsonField<Record<string, unknown> | null>(row.agent_session_data, null),
    planContent: row.plan_content,
    planCommentId: row.plan_comment_id,
    lastCheckedPlanCommentId: row.last_checked_plan_comment_id,
    source: row.source as Job["source"],
    phase: row.phase,
    progress: row.progress,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
}

export function mapJobEvent(row: DbJobEvent): JobEvent {
  return {
    id: row.id,
    jobId: row.job_id,
    eventType: row.event_type as JobEvent["eventType"],
    fromStatus: row.from_status as JobEvent["fromStatus"],
    toStatus: row.to_status as JobEvent["toStatus"],
    message: row.message,
    metadata: parseJsonField<Record<string, unknown> | null>(row.metadata, null),
    createdAt: toDate(row.created_at),
  };
}

export function mapJobLog(row: DbJobLog): JobLog {
  return {
    id: row.id,
    jobId: row.job_id,
    stream: row.stream as JobLog["stream"],
    content: row.content,
    sequence: row.sequence,
    createdAt: toDate(row.created_at),
  };
}

export function mapIssue(row: DbIssue): Issue {
  return {
    id: row.id,
    repositoryId: row.repository_id,
    number: row.number,
    title: row.title,
    body: row.body,
    state: row.state,
    htmlUrl: row.html_url,
    authorLogin: row.author_login,
    authorAvatarUrl: row.author_avatar_url,
    authorHtmlUrl: row.author_html_url,
    labels: parseJsonField(row.labels, null),
    githubCreatedAt: toDateOrNull(row.github_created_at),
    githubUpdatedAt: toDateOrNull(row.github_updated_at),
    closedAt: toDateOrNull(row.closed_at),
    lastSyncedAt: toDate(row.last_synced_at),
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
}

export function mapIssueComment(row: DbIssueComment): IssueComment {
  return {
    id: row.id,
    repositoryId: row.repository_id,
    issueNumber: row.issue_number,
    githubCommentId: row.github_comment_id,
    body: row.body,
    htmlUrl: row.html_url,
    authorLogin: row.author_login,
    authorType: row.author_type,
    authorAvatarUrl: row.author_avatar_url,
    githubCreatedAt: toDateOrNull(row.github_created_at),
    githubUpdatedAt: toDateOrNull(row.github_updated_at),
    lastSyncedAt: toDate(row.last_synced_at),
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
}

export function mapSetting(row: DbSetting): SettingsEntry {
  return {
    key: row.key,
    value: parseJsonField(row.value, null),
    updatedAt: toDate(row.updated_at),
  };
}

export function mapResearchSession(row: DbResearchSession): ResearchSession {
  return {
    id: row.id,
    repositoryId: row.repository_id,
    status: row.status as ResearchSession["status"],
    focusAreas: parseJsonField(row.focus_areas, []),
    claudeSessionId: row.claude_session_id,
    processPid: row.process_pid,
    output: row.output,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
}

export function mapResearchSuggestion(row: DbResearchSuggestion): ResearchSuggestion {
  return {
    id: row.id,
    sessionId: row.session_id,
    category: row.category as ResearchSuggestion["category"],
    severity: row.severity as ResearchSuggestion["severity"],
    title: row.title,
    description: row.description,
    filePaths: parseJsonField(row.file_paths, null),
    convertedTo: row.converted_to,
    convertedId: row.converted_id,
    createdAt: toDate(row.created_at),
  };
}
