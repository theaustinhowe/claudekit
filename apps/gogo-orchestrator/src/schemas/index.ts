import { z } from "zod";

// Job status enum matching shared types (packages/shared/src/types.ts)
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

export type JobStatusType = z.infer<typeof JobStatusSchema>;

// Query params for listing jobs
export const JobsQuerySchema = z.object({
  status: JobStatusSchema.optional(),
  repositoryId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type JobsQuery = z.infer<typeof JobsQuerySchema>;

// Job action types
export const JobActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("pause"),
    payload: z
      .object({
        reason: z.string().optional(),
      })
      .optional(),
  }),
  z.object({
    type: z.literal("resume"),
  }),
  z.object({
    type: z.literal("cancel"),
    payload: z
      .object({
        reason: z.string().optional(),
      })
      .optional(),
  }),
  z.object({
    type: z.literal("inject"),
    payload: z.object({
      message: z.string().min(1),
      mode: z.enum(["immediate", "queued"]).optional().default("immediate"),
    }),
  }),
  z.object({
    type: z.literal("request_info"),
    payload: z.object({
      question: z.string().min(1),
    }),
  }),
  z.object({
    type: z.literal("force_stop"),
    payload: z
      .object({
        reason: z.string().optional(),
      })
      .optional(),
  }),
  z.object({
    type: z.literal("retry"),
  }),
]);

export type JobAction = z.infer<typeof JobActionSchema>;

// Query params for fetching events
export const EventsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
  after: z.string().datetime().optional(),
});

export type EventsQuery = z.infer<typeof EventsQuerySchema>;

// Query params for fetching logs
export const LogsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(200),
  afterSequence: z.coerce.number().int().min(0).default(0),
  stream: z
    .enum([
      "stdout",
      "stdout:tool",
      "stdout:thinking",
      "stdout:content",
      "stderr",
      "system",
    ])
    .optional(),
});

export type LogsQuery = z.infer<typeof LogsQuerySchema>;

// WebSocket client message types
export const WsClientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("subscribe"),
    payload: z.object({
      jobId: z.string().uuid(),
      lastSequence: z.number().int().optional(),
    }),
  }),
  z.object({
    type: z.literal("unsubscribe"),
    payload: z.object({
      jobId: z.string().uuid(),
    }),
  }),
  z.object({
    type: z.literal("subscribe_repo"),
    payload: z.object({
      repositoryId: z.string().uuid(),
    }),
  }),
  z.object({
    type: z.literal("unsubscribe_repo"),
    payload: z.object({
      repositoryId: z.string().uuid(),
    }),
  }),
  z.object({
    type: z.literal("ping"),
  }),
]);

export type WsClientMessage = z.infer<typeof WsClientMessageSchema>;

// Create job request body
export const CreateJobSchema = z.object({
  issueNumber: z.number().int().positive(),
  issueTitle: z.string().min(1),
  issueUrl: z.string().url(),
  issueBody: z.string().optional(),
});

export type CreateJob = z.infer<typeof CreateJobSchema>;

// Create manual job request body (no GitHub issue required)
export const CreateManualJobSchema = z.object({
  repositoryId: z.string().uuid(),
  title: z.string().min(1).max(500),
  description: z.string().optional(),
});

export type CreateManualJob = z.infer<typeof CreateManualJobSchema>;
