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
  buildUpdate: vi.fn(),
  buildWhere: vi.fn(),
  buildInClause: vi.fn(),
  checkpoint: vi.fn(),
}));

vi.mock("../services/agents/index.js", () => ({
  agentRegistry: {
    getTotalActiveRunCount: vi.fn().mockReturnValue(2),
    listInfo: vi.fn().mockReturnValue([{ type: "claude-code", displayName: "Claude Code" }]),
  },
}));

vi.mock("../services/github/index.js", () => ({
  getAllRateLimitInfo: vi.fn().mockReturnValue({
    tokenCount: 1,
    hasWarning: false,
    hasCritical: false,
    lowestRemaining: null,
  }),
}));

vi.mock("../services/polling.js", () => ({
  isPollingActive: vi.fn().mockReturnValue(true),
  getEffectivePollInterval: vi.fn().mockResolvedValue(30000),
  getThrottleState: vi.fn().mockReturnValue({ isThrottled: false }),
}));

vi.mock("../services/shutdown.js", () => ({
  isShutdownInProgress: vi.fn().mockReturnValue(false),
}));

vi.mock("../ws/handler.js", () => ({
  getClientCount: vi.fn().mockReturnValue(5),
}));

import { queryAll } from "@claudekit/duckdb";
import { cast } from "@claudekit/test-utils";
import { getAllRateLimitInfo } from "../services/github/index.js";
import { getThrottleState } from "../services/polling.js";
import { isShutdownInProgress } from "../services/shutdown.js";
import { healthRouter, setLastPollTime } from "./health.js";

// Helper: register routes and capture the handler
interface RouteHandler {
  method: string;
  path: string;
  handler: (request: unknown, reply: unknown) => Promise<unknown>;
}

function createMockFastify() {
  const routes: RouteHandler[] = [];
  return {
    routes,
    instance: {
      get: (path: string, handler: (req: unknown, rep: unknown) => Promise<unknown>) =>
        routes.push({ method: "GET", path, handler }),
    },
  };
}

describe("health", () => {
  let healthHandler: (req: unknown, rep: unknown) => Promise<unknown>;

  beforeEach(async () => {
    vi.clearAllMocks();

    const mock = createMockFastify();
    await healthRouter(cast(mock.instance), cast({}));
    const route = mock.routes.find((r) => r.path === "/");
    if (!route) throw new Error("health route not registered");
    healthHandler = route.handler;

    // Default db mock: job counts
    vi.mocked(queryAll).mockResolvedValue([
      { status: "running", count: 2n },
      { status: "queued", count: 3n },
      { status: "paused", count: 1n },
    ]);
  });

  describe("setLastPollTime", () => {
    it("should accept Date objects without error", () => {
      expect(() => setLastPollTime(new Date())).not.toThrow();
    });

    it("should handle multiple calls", () => {
      setLastPollTime(new Date("2024-01-01"));
      setLastPollTime(new Date("2024-01-02"));
      expect(true).toBe(true);
    });
  });

  describe("GET /health endpoint", () => {
    it("should return healthy status with all subsystems", async () => {
      const result = (await healthHandler({}, {})) as Record<string, unknown>;

      expect(result.status).toBe("healthy");
      expect(result.uptime).toBeTypeOf("number");
      expect(result.uptimeFormatted).toBeTypeOf("string");
    });

    it("should return job counts by status", async () => {
      const result = (await healthHandler({}, {})) as Record<string, unknown>;
      const activeJobs = result.activeJobs as Record<string, number>;

      expect(activeJobs.running).toBe(2);
      expect(activeJobs.queued).toBe(3);
      expect(activeJobs.paused).toBe(1);
      expect(activeJobs.total).toBe(6);
    });

    it("should return polling status", async () => {
      const result = (await healthHandler({}, {})) as Record<string, unknown>;
      const polling = result.polling as Record<string, unknown>;

      expect(polling.active).toBe(true);
      expect(polling.pollIntervalMs).toBe(30000);
      expect(polling.throttled).toBe(false);
      expect(polling.throttleReason).toBeNull();
    });

    it("should include last poll time when set", async () => {
      const pollTime = new Date("2024-06-15T12:00:00Z");
      setLastPollTime(pollTime);

      const result = (await healthHandler({}, {})) as Record<string, unknown>;
      const polling = result.polling as Record<string, unknown>;

      expect(polling.lastPoll).toBe(pollTime.toISOString());
    });

    it("should return agent information", async () => {
      const result = (await healthHandler({}, {})) as Record<string, unknown>;
      const agents = result.agents as Record<string, unknown>;

      expect(agents.active).toBe(2);
      expect(agents.registered).toBe(1);
      expect(agents.types).toEqual(["claude-code"]);
    });

    it("should return database connection status", async () => {
      const result = (await healthHandler({}, {})) as Record<string, unknown>;
      const database = result.database as Record<string, unknown>;

      expect(database.connected).toBe(true);
    });

    it("should return GitHub rate limit info", async () => {
      vi.mocked(getAllRateLimitInfo).mockReturnValue({
        tokenCount: 1,
        hasWarning: true,
        hasCritical: false,
        lowestRemaining: {
          remaining: 800,
          limit: 5000,
          reset: new Date("2024-06-15T13:00:00Z"),
          used: 4200,
        },
      });

      const result = (await healthHandler({}, {})) as Record<string, unknown>;
      const github = result.github as Record<string, unknown>;

      expect(github.rateLimitTracked).toBe(true);
      expect(github.rateLimitWarning).toBe(true);
      expect(github.rateLimitCritical).toBe(false);

      const lowest = github.lowestRateLimit as Record<string, unknown>;
      expect(lowest.remaining).toBe(800);
      expect(lowest.limit).toBe(5000);
    });

    it("should return null for rate limit when no tokens tracked", async () => {
      vi.mocked(getAllRateLimitInfo).mockReturnValue({
        tokenCount: 0,
        hasWarning: false,
        hasCritical: false,
        lowestRemaining: null,
      });

      const result = (await healthHandler({}, {})) as Record<string, unknown>;
      const github = result.github as Record<string, unknown>;

      expect(github.rateLimitTracked).toBe(false);
      expect(github.lowestRateLimit).toBeNull();
    });

    it("should return shutdown status", async () => {
      const result = (await healthHandler({}, {})) as Record<string, unknown>;
      const shutdown = result.shutdown as Record<string, unknown>;

      expect(shutdown.inProgress).toBe(false);
    });

    it("should return shutdown in progress when active", async () => {
      vi.mocked(isShutdownInProgress).mockReturnValue(true);

      const result = (await healthHandler({}, {})) as Record<string, unknown>;
      const shutdown = result.shutdown as Record<string, unknown>;

      expect(shutdown.inProgress).toBe(true);
    });

    it("should return websocket client count", async () => {
      const result = (await healthHandler({}, {})) as Record<string, unknown>;
      const websocket = result.websocket as Record<string, unknown>;

      expect(websocket.clientCount).toBe(5);
    });

    it("should return throttle info when throttled", async () => {
      vi.mocked(getThrottleState).mockReturnValue({
        isThrottled: true,
        reason: "warning",
        resetAt: new Date("2024-06-15T13:00:00Z"),
      });

      const result = (await healthHandler({}, {})) as Record<string, unknown>;
      const polling = result.polling as Record<string, unknown>;

      expect(polling.throttled).toBe(true);
      expect(polling.throttleReason).toBe("warning");
      expect(polling.throttleResetAt).toBe("2024-06-15T13:00:00.000Z");
    });

    it("should handle zero job counts", async () => {
      vi.mocked(queryAll).mockResolvedValue([]);

      const result = (await healthHandler({}, {})) as Record<string, unknown>;
      const activeJobs = result.activeJobs as Record<string, number>;

      expect(activeJobs.running).toBe(0);
      expect(activeJobs.queued).toBe(0);
      expect(activeJobs.total).toBe(0);
    });
  });
});
