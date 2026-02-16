import { z } from "zod";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const JobStatusSchema = z.enum([
  "queued",
  "planning",
  "awaiting_plan_approval",
  "running",
  "needs_info",
  "ready_to_pr",
  "pr_opened",
  "pr_reviewing",
  "paused",
  "failed",
  "done",
]);

export const JobEventTypeSchema = z.enum([
  "state_change",
  "message",
  "error",
  "github_sync",
  "user_action",
  "needs_info_response",
  "plan_submitted",
  "plan_approved",
]);

export const LogStreamSchema = z.enum([
  "stdout",
  "stdout:tool",
  "stdout:thinking",
  "stdout:content",
  "stderr",
  "system",
]);

export const JobSourceSchema = z.enum(["github_issue", "manual"]);

export const InjectModeSchema = z.enum(["immediate", "queued"]);

// ---------------------------------------------------------------------------
// Core entity schemas
// ---------------------------------------------------------------------------

export const JobSchema = z.object({
  id: z.string().uuid(),
  repositoryId: z.string().uuid().nullable(),
  issueNumber: z.number().int(),
  issueUrl: z.string(),
  issueTitle: z.string(),
  issueBody: z.string().nullable(),
  status: JobStatusSchema,
  branch: z.string().nullable(),
  worktreePath: z.string().nullable(),
  prNumber: z.number().int().nullable(),
  prUrl: z.string().nullable(),
  testRetryCount: z.number().int(),
  lastTestOutput: z.string().nullable(),
  changeSummary: z.string().nullable(),
  pauseReason: z.string().nullable(),
  failureReason: z.string().nullable(),
  needsInfoQuestion: z.string().nullable(),
  needsInfoCommentId: z.number().int().nullable(),
  lastCheckedCommentId: z.number().int().nullable(),
  claudeSessionId: z.string().nullable(),
  codexSessionId: z.string().nullable(),
  injectMode: InjectModeSchema,
  pendingInjection: z.string().nullable(),
  processPid: z.number().int().nullable(),
  processStartedAt: z.coerce.date().nullable(),
  agentType: z.string(),
  agentSessionData: z.record(z.string(), z.unknown()).nullable(),
  planContent: z.string().nullable(),
  planCommentId: z.number().int().nullable(),
  lastCheckedPlanCommentId: z.number().int().nullable(),
  source: JobSourceSchema,
  phase: z.string().nullable(),
  progress: z.number().int().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const RepositorySchema = z.object({
  id: z.string().uuid(),
  owner: z.string(),
  name: z.string(),
  displayName: z.string().nullable(),
  githubToken: z.string(),
  baseBranch: z.string(),
  triggerLabel: z.string(),
  workdirPath: z.string(),
  isActive: z.boolean(),
  autoCreateJobs: z.boolean(),
  removeLabelAfterCreate: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const JobEventSchema = z.object({
  id: z.string().uuid(),
  jobId: z.string().uuid(),
  eventType: JobEventTypeSchema,
  fromStatus: JobStatusSchema.nullable(),
  toStatus: JobStatusSchema.nullable(),
  message: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.coerce.date(),
});

export const JobLogSchema = z.object({
  id: z.string().uuid(),
  jobId: z.string().uuid(),
  stream: LogStreamSchema,
  content: z.string(),
  sequence: z.number().int(),
  createdAt: z.coerce.date(),
});

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

export const CreateManualJobSchema = z.object({
  repositoryId: z.string().uuid(),
  title: z.string().min(1).max(500),
  description: z.string().optional(),
});

export const JobActionSchema = z.object({
  type: z.string(),
  payload: z
    .object({
      reason: z.string().optional(),
      message: z.string().optional(),
      mode: InjectModeSchema.optional(),
      question: z.string().optional(),
    })
    .optional(),
});

// ---------------------------------------------------------------------------
// Response wrappers
// ---------------------------------------------------------------------------

export function PaginatedResponseSchema<T extends z.ZodType>(itemSchema: T) {
  return z.object({
    data: z.array(itemSchema),
    pagination: z.object({
      total: z.number().int(),
      limit: z.number().int(),
      offset: z.number().int(),
    }),
  });
}

export function ApiResponseSchema<T extends z.ZodType>(dataSchema: T) {
  return z.object({
    data: dataSchema.optional(),
    error: z.string().optional(),
  });
}

// ---------------------------------------------------------------------------
// WebSocket schemas
// ---------------------------------------------------------------------------

export const WsMessageTypeSchema = z.enum([
  "job:updated",
  "job:log",
  "job:created",
  "issue:synced",
  "health:event",
  "connection:established",
  "subscribed",
  "unsubscribed",
  "subscribed_repo",
  "unsubscribed_repo",
  "pong",
  "error",
]);

export const WsMessageSchema = z.object({
  type: WsMessageTypeSchema,
  payload: z.unknown(),
});

export const WsClientMessageTypeSchema = z.enum([
  "subscribe",
  "unsubscribe",
  "subscribe_repo",
  "unsubscribe_repo",
  "ping",
]);

export const WsClientMessageSchema = z.object({
  type: WsClientMessageTypeSchema,
  payload: z
    .object({
      jobId: z.string().optional(),
      repositoryId: z.string().optional(),
      lastSequence: z.number().int().optional(),
    })
    .optional(),
});
