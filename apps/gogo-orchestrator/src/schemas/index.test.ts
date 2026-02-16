import { describe, expect, it } from "vitest";
import {
  CreateJobSchema,
  CreateManualJobSchema,
  EventsQuerySchema,
  JobActionSchema,
  JobsQuerySchema,
  LogsQuerySchema,
  WsClientMessageSchema,
} from "./index.js";

describe("JobsQuerySchema", () => {
  it("validates with defaults", () => {
    const result = JobsQuerySchema.parse({});
    expect(result.limit).toBe(50);
    expect(result.offset).toBe(0);
  });

  it("validates with valid status", () => {
    const result = JobsQuerySchema.parse({ status: "running" });
    expect(result.status).toBe("running");
  });

  it("rejects invalid status", () => {
    expect(() => JobsQuerySchema.parse({ status: "invalid" })).toThrow();
  });

  it("coerces string numbers", () => {
    const result = JobsQuerySchema.parse({ limit: "10", offset: "5" });
    expect(result.limit).toBe(10);
    expect(result.offset).toBe(5);
  });
});

describe("JobActionSchema", () => {
  it("validates pause action", () => {
    const result = JobActionSchema.parse({ type: "pause", payload: { reason: "break" } });
    expect(result.type).toBe("pause");
  });

  it("validates resume action", () => {
    const result = JobActionSchema.parse({ type: "resume" });
    expect(result.type).toBe("resume");
  });

  it("validates inject action", () => {
    const result = JobActionSchema.parse({
      type: "inject",
      payload: { message: "fix the bug" },
    });
    expect(result.type).toBe("inject");
  });

  it("rejects inject without message", () => {
    expect(() => JobActionSchema.parse({ type: "inject", payload: {} })).toThrow();
  });

  it("rejects unknown action type", () => {
    expect(() => JobActionSchema.parse({ type: "unknown" })).toThrow();
  });
});

describe("EventsQuerySchema", () => {
  it("validates with defaults", () => {
    const result = EventsQuerySchema.parse({});
    expect(result.limit).toBe(100);
    expect(result.offset).toBe(0);
  });
});

describe("LogsQuerySchema", () => {
  it("validates with defaults", () => {
    const result = LogsQuerySchema.parse({});
    expect(result.limit).toBe(200);
    expect(result.afterSequence).toBe(0);
  });

  it("validates stream filter", () => {
    const result = LogsQuerySchema.parse({ stream: "stderr" });
    expect(result.stream).toBe("stderr");
  });
});

describe("WsClientMessageSchema", () => {
  it("validates subscribe message", () => {
    const result = WsClientMessageSchema.parse({
      type: "subscribe",
      payload: { jobId: "550e8400-e29b-41d4-a716-446655440000" },
    });
    expect(result.type).toBe("subscribe");
  });

  it("validates ping message", () => {
    const result = WsClientMessageSchema.parse({ type: "ping" });
    expect(result.type).toBe("ping");
  });
});

describe("CreateJobSchema", () => {
  it("validates job creation", () => {
    const result = CreateJobSchema.parse({
      issueNumber: 42,
      issueTitle: "Fix bug",
      issueUrl: "https://github.com/owner/repo/issues/42",
    });
    expect(result.issueNumber).toBe(42);
  });

  it("rejects missing title", () => {
    expect(() =>
      CreateJobSchema.parse({
        issueNumber: 42,
        issueUrl: "https://github.com/owner/repo/issues/42",
      }),
    ).toThrow();
  });
});

describe("CreateManualJobSchema", () => {
  it("validates manual job creation", () => {
    const result = CreateManualJobSchema.parse({
      repositoryId: "550e8400-e29b-41d4-a716-446655440000",
      title: "Manual task",
    });
    expect(result.title).toBe("Manual task");
  });

  it("rejects non-UUID repositoryId", () => {
    expect(() =>
      CreateManualJobSchema.parse({
        repositoryId: "not-uuid",
        title: "Bad task",
      }),
    ).toThrow();
  });
});
