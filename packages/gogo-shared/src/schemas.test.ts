import { describe, expect, it } from "vitest";
import {
  ApiResponseSchema,
  CreateManualJobSchema,
  InjectModeSchema,
  JobActionSchema,
  JobEventSchema,
  JobEventTypeSchema,
  JobLogSchema,
  JobSchema,
  JobSourceSchema,
  JobStatusSchema,
  LogStreamSchema,
  PaginatedResponseSchema,
  RepositorySchema,
  WsClientMessageSchema,
  WsClientMessageTypeSchema,
  WsMessageSchema,
  WsMessageTypeSchema,
} from "./schemas";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _c = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++_c).padStart(12, "0")}`;
const now = new Date().toISOString();

function makeValidJob(overrides: Record<string, unknown> = {}) {
  return {
    id: uuid(),
    repositoryId: uuid(),
    issueNumber: 42,
    issueUrl: "https://github.com/org/repo/issues/42",
    issueTitle: "Fix the bug",
    issueBody: "Detailed description",
    status: "queued",
    branch: "fix/42-bug",
    worktreePath: "/tmp/worktree",
    prNumber: null,
    prUrl: null,
    testRetryCount: 0,
    lastTestOutput: null,
    changeSummary: null,
    pauseReason: null,
    failureReason: null,
    needsInfoQuestion: null,
    needsInfoCommentId: null,
    lastCheckedCommentId: null,
    claudeSessionId: null,
    injectMode: "immediate",
    pendingInjection: null,
    processPid: null,
    processStartedAt: null,
    agentType: "claude-code",
    agentSessionData: null,
    planContent: null,
    planCommentId: null,
    lastCheckedPlanCommentId: null,
    source: "github_issue",
    phase: null,
    progress: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeValidRepository(overrides: Record<string, unknown> = {}) {
  return {
    id: uuid(),
    owner: "acme",
    name: "widget",
    displayName: "Acme Widget",
    githubToken: "ghp_abc123",
    baseBranch: "main",
    triggerLabel: "gogo",
    workdirPath: "/home/runner/work",
    isActive: true,
    autoCreateJobs: false,
    removeLabelAfterCreate: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Enum schemas
// ---------------------------------------------------------------------------

describe("JobStatusSchema", () => {
  const validStatuses = [
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
  ] as const;

  it.each(validStatuses)("accepts '%s'", (status) => {
    expect(JobStatusSchema.parse(status)).toBe(status);
  });

  it("rejects an invalid status", () => {
    expect(() => JobStatusSchema.parse("cancelled")).toThrow();
  });

  it("rejects a number", () => {
    expect(() => JobStatusSchema.parse(1)).toThrow();
  });
});

describe("JobEventTypeSchema", () => {
  const validTypes = [
    "state_change",
    "message",
    "error",
    "github_sync",
    "user_action",
    "needs_info_response",
    "plan_submitted",
    "plan_approved",
  ] as const;

  it.each(validTypes)("accepts '%s'", (t) => {
    expect(JobEventTypeSchema.parse(t)).toBe(t);
  });

  it("rejects unknown event types", () => {
    expect(() => JobEventTypeSchema.parse("unknown_event")).toThrow();
  });
});

describe("LogStreamSchema", () => {
  const validStreams = ["stdout", "stdout:tool", "stdout:thinking", "stdout:content", "stderr", "system"] as const;

  it.each(validStreams)("accepts '%s'", (s) => {
    expect(LogStreamSchema.parse(s)).toBe(s);
  });

  it("rejects invalid stream", () => {
    expect(() => LogStreamSchema.parse("stdin")).toThrow();
  });
});

describe("JobSourceSchema", () => {
  it("accepts 'github_issue'", () => {
    expect(JobSourceSchema.parse("github_issue")).toBe("github_issue");
  });

  it("accepts 'manual'", () => {
    expect(JobSourceSchema.parse("manual")).toBe("manual");
  });

  it("rejects other values", () => {
    expect(() => JobSourceSchema.parse("webhook")).toThrow();
  });
});

describe("InjectModeSchema", () => {
  it("accepts 'immediate'", () => {
    expect(InjectModeSchema.parse("immediate")).toBe("immediate");
  });

  it("accepts 'queued'", () => {
    expect(InjectModeSchema.parse("queued")).toBe("queued");
  });

  it("rejects other values", () => {
    expect(() => InjectModeSchema.parse("batch")).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Core entity schemas
// ---------------------------------------------------------------------------

describe("JobSchema", () => {
  it("parses a fully valid job", () => {
    const input = makeValidJob();
    const result = JobSchema.parse(input);
    expect(result.id).toBe(input.id);
    expect(result.status).toBe("queued");
    expect(result.issueNumber).toBe(42);
  });

  it("coerces ISO date strings to Date objects", () => {
    const input = makeValidJob({ createdAt: "2025-06-01T00:00:00Z", updatedAt: "2025-06-02T12:00:00Z" });
    const result = JobSchema.parse(input);
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.updatedAt).toBeInstanceOf(Date);
  });

  it("coerces processStartedAt when present", () => {
    const input = makeValidJob({ processStartedAt: "2025-06-01T10:00:00Z" });
    const result = JobSchema.parse(input);
    expect(result.processStartedAt).toBeInstanceOf(Date);
  });

  it("accepts null for nullable fields", () => {
    const input = makeValidJob({
      repositoryId: null,
      issueBody: null,
      branch: null,
      worktreePath: null,
      prNumber: null,
      prUrl: null,
      lastTestOutput: null,
      changeSummary: null,
      pauseReason: null,
      failureReason: null,
      needsInfoQuestion: null,
      needsInfoCommentId: null,
      lastCheckedCommentId: null,
      claudeSessionId: null,
      pendingInjection: null,
      processPid: null,
      processStartedAt: null,
      agentSessionData: null,
      planContent: null,
      planCommentId: null,
      lastCheckedPlanCommentId: null,
      phase: null,
      progress: null,
    });
    const result = JobSchema.parse(input);
    expect(result.repositoryId).toBeNull();
    expect(result.branch).toBeNull();
    expect(result.processStartedAt).toBeNull();
  });

  it("rejects when id is not a UUID", () => {
    expect(() => JobSchema.parse(makeValidJob({ id: "not-a-uuid" }))).toThrow();
  });

  it("rejects when required field is missing", () => {
    const input = makeValidJob();
    const { issueTitle: _, ...incomplete } = input;
    expect(() => JobSchema.parse(incomplete)).toThrow();
  });

  it("rejects an invalid status value", () => {
    expect(() => JobSchema.parse(makeValidJob({ status: "cancelled" }))).toThrow();
  });

  it("rejects an invalid injectMode", () => {
    expect(() => JobSchema.parse(makeValidJob({ injectMode: "batch" }))).toThrow();
  });

  it("rejects an invalid source", () => {
    expect(() => JobSchema.parse(makeValidJob({ source: "webhook" }))).toThrow();
  });

  it("accepts agentSessionData as a record", () => {
    const input = makeValidJob({ agentSessionData: { foo: "bar", nested: { a: 1 } } });
    const result = JobSchema.parse(input);
    expect(result.agentSessionData).toEqual({ foo: "bar", nested: { a: 1 } });
  });

  it("parses all valid status values through JobSchema", () => {
    const statuses = [
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
    ];
    for (const status of statuses) {
      const result = JobSchema.parse(makeValidJob({ status }));
      expect(result.status).toBe(status);
    }
  });
});

describe("RepositorySchema", () => {
  it("parses a fully valid repository", () => {
    const input = makeValidRepository();
    const result = RepositorySchema.parse(input);
    expect(result.owner).toBe("acme");
    expect(result.name).toBe("widget");
    expect(result.isActive).toBe(true);
  });

  it("coerces date strings to Date objects", () => {
    const result = RepositorySchema.parse(makeValidRepository());
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.updatedAt).toBeInstanceOf(Date);
  });

  it("accepts null displayName", () => {
    const result = RepositorySchema.parse(makeValidRepository({ displayName: null }));
    expect(result.displayName).toBeNull();
  });

  it("rejects missing owner", () => {
    const { owner: _, ...input } = makeValidRepository();
    expect(() => RepositorySchema.parse(input)).toThrow();
  });

  it("rejects non-UUID id", () => {
    expect(() => RepositorySchema.parse(makeValidRepository({ id: "bad" }))).toThrow();
  });

  it("rejects non-boolean isActive", () => {
    expect(() => RepositorySchema.parse(makeValidRepository({ isActive: "yes" }))).toThrow();
  });
});

describe("JobEventSchema", () => {
  const validEvent = () => ({
    id: uuid(),
    jobId: uuid(),
    eventType: "state_change",
    fromStatus: "queued",
    toStatus: "running",
    message: "Job started",
    metadata: { triggeredBy: "scheduler" },
    createdAt: now,
  });

  it("parses a valid job event", () => {
    const input = validEvent();
    const result = JobEventSchema.parse(input);
    expect(result.eventType).toBe("state_change");
    expect(result.fromStatus).toBe("queued");
    expect(result.toStatus).toBe("running");
  });

  it("accepts null for fromStatus, toStatus, message, metadata", () => {
    const input = { ...validEvent(), fromStatus: null, toStatus: null, message: null, metadata: null };
    const result = JobEventSchema.parse(input);
    expect(result.fromStatus).toBeNull();
    expect(result.toStatus).toBeNull();
    expect(result.message).toBeNull();
    expect(result.metadata).toBeNull();
  });

  it("rejects invalid eventType", () => {
    expect(() => JobEventSchema.parse({ ...validEvent(), eventType: "unknown" })).toThrow();
  });

  it("rejects invalid fromStatus enum value", () => {
    expect(() => JobEventSchema.parse({ ...validEvent(), fromStatus: "invalid_status" })).toThrow();
  });
});

describe("JobLogSchema", () => {
  const validLog = () => ({
    id: uuid(),
    jobId: uuid(),
    stream: "stdout",
    content: "Hello world",
    sequence: 1,
    createdAt: now,
  });

  it("parses a valid job log", () => {
    const result = JobLogSchema.parse(validLog());
    expect(result.stream).toBe("stdout");
    expect(result.content).toBe("Hello world");
    expect(result.sequence).toBe(1);
  });

  it("accepts all valid stream values", () => {
    const streams = ["stdout", "stdout:tool", "stdout:thinking", "stdout:content", "stderr", "system"];
    for (const stream of streams) {
      const result = JobLogSchema.parse({ ...validLog(), stream });
      expect(result.stream).toBe(stream);
    }
  });

  it("rejects missing content", () => {
    const { content: _, ...input } = validLog();
    expect(() => JobLogSchema.parse(input)).toThrow();
  });

  it("rejects invalid stream", () => {
    expect(() => JobLogSchema.parse({ ...validLog(), stream: "stdin" })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

describe("CreateManualJobSchema", () => {
  it("parses valid input with required fields", () => {
    const result = CreateManualJobSchema.parse({
      repositoryId: uuid(),
      title: "Implement feature X",
    });
    expect(result.title).toBe("Implement feature X");
    expect(result.description).toBeUndefined();
  });

  it("accepts optional description", () => {
    const result = CreateManualJobSchema.parse({
      repositoryId: uuid(),
      title: "Fix bug",
      description: "Detailed description here",
    });
    expect(result.description).toBe("Detailed description here");
  });

  it("rejects empty title", () => {
    expect(() =>
      CreateManualJobSchema.parse({
        repositoryId: uuid(),
        title: "",
      }),
    ).toThrow();
  });

  it("rejects title exceeding 500 characters", () => {
    expect(() =>
      CreateManualJobSchema.parse({
        repositoryId: uuid(),
        title: "A".repeat(501),
      }),
    ).toThrow();
  });

  it("accepts title at exactly 500 characters", () => {
    const result = CreateManualJobSchema.parse({
      repositoryId: uuid(),
      title: "A".repeat(500),
    });
    expect(result.title.length).toBe(500);
  });

  it("rejects non-UUID repositoryId", () => {
    expect(() =>
      CreateManualJobSchema.parse({
        repositoryId: "not-uuid",
        title: "Valid title",
      }),
    ).toThrow();
  });

  it("rejects missing repositoryId", () => {
    expect(() =>
      CreateManualJobSchema.parse({
        title: "Valid title",
      }),
    ).toThrow();
  });
});

describe("JobActionSchema", () => {
  it("parses action with only type", () => {
    const result = JobActionSchema.parse({ type: "pause" });
    expect(result.type).toBe("pause");
    expect(result.payload).toBeUndefined();
  });

  it("parses action with payload", () => {
    const result = JobActionSchema.parse({
      type: "inject",
      payload: { message: "Fix the tests", mode: "immediate" },
    });
    expect(result.payload?.message).toBe("Fix the tests");
    expect(result.payload?.mode).toBe("immediate");
  });

  it("accepts payload with reason", () => {
    const result = JobActionSchema.parse({
      type: "pause",
      payload: { reason: "Waiting for review" },
    });
    expect(result.payload?.reason).toBe("Waiting for review");
  });

  it("accepts payload with question", () => {
    const result = JobActionSchema.parse({
      type: "request_info",
      payload: { question: "Which API version?" },
    });
    expect(result.payload?.question).toBe("Which API version?");
  });

  it("rejects invalid inject mode in payload", () => {
    expect(() =>
      JobActionSchema.parse({
        type: "inject",
        payload: { mode: "batch" },
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Response wrappers
// ---------------------------------------------------------------------------

describe("PaginatedResponseSchema", () => {
  it("parses a paginated list of jobs", () => {
    const schema = PaginatedResponseSchema(JobStatusSchema);
    const result = schema.parse({
      data: ["queued", "running"],
      pagination: { total: 10, limit: 2, offset: 0 },
    });
    expect(result.data).toEqual(["queued", "running"]);
    expect(result.pagination.total).toBe(10);
  });

  it("accepts empty data array", () => {
    const schema = PaginatedResponseSchema(JobStatusSchema);
    const result = schema.parse({
      data: [],
      pagination: { total: 0, limit: 20, offset: 0 },
    });
    expect(result.data).toHaveLength(0);
  });

  it("rejects missing pagination", () => {
    const schema = PaginatedResponseSchema(JobStatusSchema);
    expect(() => schema.parse({ data: [] })).toThrow();
  });

  it("rejects invalid items in data array", () => {
    const schema = PaginatedResponseSchema(JobStatusSchema);
    expect(() =>
      schema.parse({
        data: ["queued", "invalid_status"],
        pagination: { total: 2, limit: 10, offset: 0 },
      }),
    ).toThrow();
  });
});

describe("ApiResponseSchema", () => {
  it("parses response with data", () => {
    const schema = ApiResponseSchema(JobStatusSchema);
    const result = schema.parse({ data: "running" });
    expect(result.data).toBe("running");
  });

  it("parses response with error", () => {
    const schema = ApiResponseSchema(JobStatusSchema);
    const result = schema.parse({ error: "Not found" });
    expect(result.error).toBe("Not found");
    expect(result.data).toBeUndefined();
  });

  it("parses response with neither data nor error", () => {
    const schema = ApiResponseSchema(JobStatusSchema);
    const result = schema.parse({});
    expect(result.data).toBeUndefined();
    expect(result.error).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// WebSocket schemas
// ---------------------------------------------------------------------------

describe("WsMessageTypeSchema", () => {
  const validTypes = [
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
  ] as const;

  it.each(validTypes)("accepts '%s'", (t) => {
    expect(WsMessageTypeSchema.parse(t)).toBe(t);
  });

  it("rejects unknown message type", () => {
    expect(() => WsMessageTypeSchema.parse("job:deleted")).toThrow();
  });
});

describe("WsMessageSchema", () => {
  it("parses a valid server message", () => {
    const result = WsMessageSchema.parse({
      type: "job:updated",
      payload: { id: uuid(), status: "running" },
    });
    expect(result.type).toBe("job:updated");
  });

  it("accepts any payload shape (z.unknown)", () => {
    const result = WsMessageSchema.parse({
      type: "pong",
      payload: null,
    });
    expect(result.payload).toBeNull();
  });

  it("accepts payload as a string", () => {
    const result = WsMessageSchema.parse({
      type: "error",
      payload: "Something went wrong",
    });
    expect(result.payload).toBe("Something went wrong");
  });

  it("rejects missing type", () => {
    expect(() => WsMessageSchema.parse({ payload: {} })).toThrow();
  });

  it("rejects invalid type", () => {
    expect(() => WsMessageSchema.parse({ type: "invalid", payload: {} })).toThrow();
  });
});

describe("WsClientMessageTypeSchema", () => {
  const validTypes = ["subscribe", "unsubscribe", "subscribe_repo", "unsubscribe_repo", "ping"] as const;

  it.each(validTypes)("accepts '%s'", (t) => {
    expect(WsClientMessageTypeSchema.parse(t)).toBe(t);
  });

  it("rejects unknown client message type", () => {
    expect(() => WsClientMessageTypeSchema.parse("broadcast")).toThrow();
  });
});

describe("WsClientMessageSchema", () => {
  it("parses a subscribe message with jobId", () => {
    const result = WsClientMessageSchema.parse({
      type: "subscribe",
      payload: { jobId: uuid() },
    });
    expect(result.type).toBe("subscribe");
    expect(result.payload?.jobId).toBeDefined();
  });

  it("parses a subscribe_repo message with repositoryId", () => {
    const result = WsClientMessageSchema.parse({
      type: "subscribe_repo",
      payload: { repositoryId: uuid() },
    });
    expect(result.type).toBe("subscribe_repo");
    expect(result.payload?.repositoryId).toBeDefined();
  });

  it("parses a ping with no payload", () => {
    const result = WsClientMessageSchema.parse({ type: "ping" });
    expect(result.type).toBe("ping");
    expect(result.payload).toBeUndefined();
  });

  it("accepts payload with lastSequence", () => {
    const result = WsClientMessageSchema.parse({
      type: "subscribe",
      payload: { jobId: uuid(), lastSequence: 42 },
    });
    expect(result.payload?.lastSequence).toBe(42);
  });

  it("rejects invalid type", () => {
    expect(() => WsClientMessageSchema.parse({ type: "broadcast" })).toThrow();
  });
});
