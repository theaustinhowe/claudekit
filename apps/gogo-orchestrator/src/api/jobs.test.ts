import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock dependencies
vi.mock("../db/index.js", () => ({
  getDb: vi.fn(async () => ({})),
}));

vi.mock("@claudekit/duckdb", () => ({
  queryAll: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
  withTransaction: vi.fn(),
  buildWhere: vi.fn(),
  buildInClause: vi.fn(),
  checkpoint: vi.fn(),
}));

vi.mock("../db/schema.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../db/schema.js")>();
  return {
    ...actual,
    mapJob: vi.fn((row: unknown) => row),
  };
});

vi.mock("../ws/handler.js", () => ({
  broadcast: vi.fn(),
}));

vi.mock("../services/agent-executor.js", () => ({
  resumeAgent: vi.fn(),
  startAgent: vi.fn(),
}));

vi.mock("../services/agent-runner.js", () => ({
  isRunning: vi.fn().mockReturnValue(false),
  startJobRun: vi.fn(),
  stopJobRun: vi.fn(),
}));

vi.mock("../services/claude-code-agent.js", () => ({
  injectMessage: vi.fn(),
  isRunning: vi.fn().mockReturnValue(false),
  pauseClaudeRun: vi.fn(),
  resumeClaudeRun: vi.fn(),
  startClaudeRun: vi.fn(),
  stopClaudeRun: vi.fn(),
}));

vi.mock("../services/mock-agent.js", () => ({
  isRunning: vi.fn().mockReturnValue(false),
  startMockRun: vi.fn(),
  stopMockRun: vi.fn(),
}));

vi.mock("../services/needs-info.js", () => ({
  checkJobForResponseById: vi.fn(),
  enterNeedsInfo: vi.fn(),
}));

vi.mock("../services/pr-flow.js", () => ({
  processReadyToPr: vi.fn(),
}));

vi.mock("../services/state-machine.js", () => ({
  applyActionAtomic: vi.fn(),
}));

import { buildInClause, execute, queryAll, queryOne } from "@claudekit/duckdb";
import { cast } from "@claudekit/test-utils";
import { mapJob } from "../db/schema.js";
import { startAgent } from "../services/agent-executor.js";
import { startJobRun } from "../services/agent-runner.js";
import { startClaudeRun } from "../services/claude-code-agent.js";
import { enterNeedsInfo } from "../services/needs-info.js";
import { processReadyToPr } from "../services/pr-flow.js";
import { applyActionAtomic } from "../services/state-machine.js";
import { createMockFastify, createMockReply, type RouteHandler } from "../test-utils.js";
import { broadcast } from "../ws/handler.js";

describe("jobs API", () => {
  let routes: RouteHandler[];
  let getHandler: (path: string) => (req: unknown, rep: unknown) => Promise<unknown>;

  beforeEach(async () => {
    vi.clearAllMocks();

    // mapJob passes through by default
    vi.mocked(mapJob).mockImplementation((row: unknown) => row as ReturnType<typeof mapJob>);

    const { jobsRouter } = await import("./jobs.js");
    const mock = createMockFastify();
    routes = mock.routes;
    await jobsRouter(cast(mock.instance), cast({}));

    getHandler = (path: string) => {
      const route = routes.find((r) => r.path === path);
      if (!route) throw new Error(`No route found for path: ${path}`);
      return route.handler;
    };
  });

  describe("GET / (list jobs)", () => {
    it("should return paginated jobs", async () => {
      const mockJobs = [
        { id: "job-1", status: "queued" },
        { id: "job-2", status: "running" },
      ];

      // First call: count query
      vi.mocked(queryOne).mockResolvedValueOnce({ total: 2n });
      // Second call: paginated rows
      vi.mocked(queryAll).mockResolvedValueOnce(mockJobs);

      const handler = getHandler("/");
      const result = await handler({ query: { limit: "50", offset: "0" } }, createMockReply());

      expect(result).toEqual({
        data: mockJobs,
        pagination: { total: 2, limit: 50, offset: 0 },
      });
    });

    it("should return 400 for invalid query parameters", async () => {
      const handler = getHandler("/");
      const reply = createMockReply();

      await handler({ query: { limit: "-1" } }, reply);

      expect(reply._statusCode).toBe(400);
    });
  });

  describe("GET /:id (single job)", () => {
    it("should return a job by ID", async () => {
      const job = { id: "job-1", status: "queued" };
      vi.mocked(queryOne).mockResolvedValue(job);

      const handler = getHandler("/:id");
      const result = await handler({ params: { id: "job-1" } }, createMockReply());

      expect(result).toEqual({ data: job });
    });

    it("should return 404 when job not found", async () => {
      vi.mocked(queryOne).mockResolvedValue(undefined);

      const handler = getHandler("/:id");
      const reply = createMockReply();
      await handler({ params: { id: "nonexistent" } }, reply);

      expect(reply._statusCode).toBe(404);
    });
  });

  describe("POST / (create job)", () => {
    it("should create a new job", async () => {
      const newJob = { id: "job-new", status: "queued", issueNumber: 1 };

      // queryOne for INSERT ... RETURNING
      vi.mocked(queryOne).mockResolvedValueOnce(newJob);
      // execute for event insertion
      vi.mocked(execute).mockResolvedValue(undefined);

      const handler = routes.find((r) => r.method === "POST" && r.path === "/")?.handler;
      const result = await handler?.(
        {
          body: {
            issueNumber: 1,
            issueTitle: "Test issue",
            issueUrl: "https://github.com/test/test/issues/1",
          },
        },
        createMockReply(),
      );

      expect(result).toEqual({ data: newJob });
      expect(broadcast).toHaveBeenCalledWith({
        type: "job:created",
        payload: newJob,
      });
    });

    it("should return 400 for invalid body", async () => {
      const handler = routes.find((r) => r.method === "POST" && r.path === "/")?.handler;
      const reply = createMockReply();

      await handler?.({ body: {} }, reply);

      expect(reply._statusCode).toBe(400);
    });
  });

  describe("POST /:id/actions (job actions)", () => {
    it("should apply pause action", async () => {
      const job = { id: "job-1", status: "running" };
      const pausedJob = { id: "job-1", status: "paused" };

      vi.mocked(queryOne).mockResolvedValue(job);

      vi.mocked(applyActionAtomic).mockResolvedValue(
        cast({
          success: true,
          job: pausedJob,
        }),
      );

      const handler = routes.find((r) => r.method === "POST" && r.path === "/:id/actions")?.handler;
      const result = await handler?.({ params: { id: "job-1" }, body: { type: "pause" } }, createMockReply());

      expect(result).toEqual({ data: pausedJob });
    });

    it("should return 404 when job not found for action", async () => {
      vi.mocked(queryOne).mockResolvedValue(undefined);

      const handler = routes.find((r) => r.method === "POST" && r.path === "/:id/actions")?.handler;
      const reply = createMockReply();
      await handler?.({ params: { id: "nonexistent" }, body: { type: "resume" } }, reply);

      expect(reply._statusCode).toBe(404);
    });

    it("should return 400 for invalid action", async () => {
      const handler = routes.find((r) => r.method === "POST" && r.path === "/:id/actions")?.handler;
      const reply = createMockReply();

      await handler?.({ params: { id: "job-1" }, body: { type: "invalid_action" } }, reply);

      expect(reply._statusCode).toBe(400);
    });

    it("should handle request_info action with GitHub posting", async () => {
      const job = { id: "job-1", status: "running" };
      const updatedJob = { id: "job-1", status: "needs_info" };

      // First call: get current job
      vi.mocked(queryOne)
        .mockResolvedValueOnce(job)
        // Second call: fetch updated job after enterNeedsInfo
        .mockResolvedValueOnce(updatedJob);

      vi.mocked(enterNeedsInfo).mockResolvedValue(undefined);

      const handler = routes.find((r) => r.method === "POST" && r.path === "/:id/actions")?.handler;
      const result = await handler?.(
        {
          params: { id: "job-1" },
          body: {
            type: "request_info",
            payload: { question: "What is the API key?" },
          },
        },
        createMockReply(),
      );

      expect(enterNeedsInfo).toHaveBeenCalledWith("job-1", "What is the API key?");
      expect(result).toEqual({ data: updatedJob });
    });

    it("should return 400 for request_info on non-running job", async () => {
      const job = { id: "job-1", status: "paused" };

      vi.mocked(queryOne).mockResolvedValue(job);

      const handler = routes.find((r) => r.method === "POST" && r.path === "/:id/actions")?.handler;
      const reply = createMockReply();

      await handler?.(
        {
          params: { id: "job-1" },
          body: {
            type: "request_info",
            payload: { question: "test?" },
          },
        },
        reply,
      );

      expect(reply._statusCode).toBe(400);
    });
  });

  describe("POST /:id/start (start job run)", () => {
    it("should start a job run", async () => {
      vi.mocked(startJobRun).mockResolvedValue({ success: true });

      const handler = routes.find((r) => r.method === "POST" && r.path === "/:id/start")?.handler;
      const result = await handler?.({ params: { id: "job-1" } }, createMockReply());

      expect(result).toEqual({ success: true, message: "Job run started" });
    });

    it("should return 400 when start fails", async () => {
      vi.mocked(startJobRun).mockResolvedValue({
        success: false,
        error: "Job not queued",
      });

      const handler = routes.find((r) => r.method === "POST" && r.path === "/:id/start")?.handler;
      const reply = createMockReply();
      await handler?.({ params: { id: "job-1" } }, reply);

      expect(reply._statusCode).toBe(400);
    });
  });

  describe("POST /:id/start-claude", () => {
    it("should start a Claude run", async () => {
      vi.mocked(startClaudeRun).mockResolvedValue(cast({ success: true }));

      const handler = routes.find((r) => r.method === "POST" && r.path === "/:id/start-claude")?.handler;
      const result = await handler?.({ params: { id: "job-1" } }, createMockReply());

      expect(result).toEqual({
        success: true,
        message: "Claude Code run started",
      });
    });
  });

  describe("POST /:id/start-agent", () => {
    it("should start an agent with optional type", async () => {
      vi.mocked(startAgent).mockResolvedValue(cast({ success: true }));

      const handler = routes.find((r) => r.method === "POST" && r.path === "/:id/start-agent")?.handler;
      const result = await handler?.(
        { params: { id: "job-1" }, body: { agentType: "claude-code" } },
        createMockReply(),
      );

      expect(startAgent).toHaveBeenCalledWith("job-1", "claude-code");
      expect(result).toEqual({ success: true, message: "Agent run started" });
    });
  });

  describe("POST /:id/create-pr", () => {
    it("should create PR successfully", async () => {
      vi.mocked(processReadyToPr).mockResolvedValue({
        success: true,
        prUrl: "https://github.com/test/test/pull/1",
        prNumber: 1,
      });

      const handler = routes.find((r) => r.method === "POST" && r.path === "/:id/create-pr")?.handler;
      const result = await handler?.({ params: { id: "job-1" } }, createMockReply());

      expect(result).toEqual({
        success: true,
        prUrl: "https://github.com/test/test/pull/1",
        prNumber: 1,
      });
    });

    it("should return retry info when retried to running", async () => {
      vi.mocked(processReadyToPr).mockResolvedValue({
        success: false,
        error: "Tests failed",
        retriedToRunning: true,
      });

      const handler = routes.find((r) => r.method === "POST" && r.path === "/:id/create-pr")?.handler;
      const result = await handler?.({ params: { id: "job-1" } }, createMockReply());

      expect(result).toEqual({
        success: false,
        message: "Tests failed",
        retriedToRunning: true,
      });
    });
  });

  describe("GET /stale", () => {
    it("should return stale jobs", async () => {
      const staleJob = { id: "stale-1", status: "running" };

      vi.mocked(buildInClause).mockReturnValue({
        clause: "status IN (?, ?)",
        params: ["running", "needs_info"],
      });
      vi.mocked(queryAll).mockResolvedValue([staleJob]);

      const handler = routes.find((r) => r.method === "GET" && r.path === "/stale")?.handler;
      const result = await handler?.({ query: {} }, createMockReply());

      expect(result).toEqual({
        data: [staleJob],
        thresholdMinutes: 60,
        count: 1,
      });
    });
  });
});
