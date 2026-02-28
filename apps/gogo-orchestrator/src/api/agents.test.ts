import { beforeEach, describe, expect, it, vi } from "vitest";

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

vi.mock("../services/agent-executor.js", () => ({
  listAgents: vi.fn(),
}));

vi.mock("../services/agents/claude-code-runner.js", () => ({
  getClaudeRunnerStatus: vi.fn(),
}));

vi.mock("../services/agents/index.js", () => ({
  agentRegistry: {
    has: vi.fn(),
    get: vi.fn(),
  },
  KNOWN_AGENTS: [{ type: "claude-code", displayName: "Claude Code", description: "Anthropic Claude" }],
}));

import { cast } from "@claudekit/test-utils";
import { listAgents } from "../services/agent-executor.js";
import { getClaudeRunnerStatus } from "../services/agents/claude-code-runner.js";
import { agentRegistry } from "../services/agents/index.js";
import { createMockFastify, createMockReply, type RouteHandler } from "../test-utils.js";
import { agentsRouter } from "./agents.js";

describe("agents API", () => {
  let routes: RouteHandler[];

  beforeEach(async () => {
    vi.clearAllMocks();

    const mock = createMockFastify();
    routes = mock.routes;
    await agentsRouter(cast(mock.instance), cast({}));
  });

  describe("GET / (list agents)", () => {
    it("should return registered agents", async () => {
      const agents = [{ type: "claude-code", displayName: "Claude Code" }];
      vi.mocked(listAgents).mockReturnValue(cast(agents));

      const handler = routes.find((r) => r.path === "/")?.handler;
      const result = await handler?.({}, createMockReply());

      expect(result).toEqual({ data: agents });
    });
  });

  describe("GET /all (all known agents)", () => {
    it("should return all known agents with status", async () => {
      vi.mocked(agentRegistry.has).mockReturnValue(true);
      vi.mocked(getClaudeRunnerStatus).mockResolvedValue({
        type: "claude-code",
        available: true,
        configured: true,
        message: "Ready",
        cliInstalled: true,
        settingsEnabled: true,
        registered: true,
        stub: false,
      });

      const handler = routes.find((r) => r.path === "/all")?.handler;
      const result = (await handler?.({}, createMockReply())) as { data: unknown[] };

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toEqual(
        expect.objectContaining({
          type: "claude-code",
          registered: true,
          status: expect.objectContaining({ available: true }),
        }),
      );
    });
  });

  describe("GET /:type (agent by type)", () => {
    it("should return agent info when found", async () => {
      const mockRunner = {
        type: "claude-code",
        displayName: "Claude Code",
        capabilities: { canResume: true, canInject: true, supportsStreaming: true },
        getActiveRunCount: () => 2,
      };
      vi.mocked(agentRegistry.get).mockReturnValue(cast(mockRunner));

      const handler = routes.find((r) => r.path === "/:type")?.handler;
      const result = await handler?.({ params: { type: "claude-code" } }, createMockReply());

      expect(result).toEqual({
        data: {
          type: "claude-code",
          displayName: "Claude Code",
          capabilities: { canResume: true, canInject: true, supportsStreaming: true },
          activeRunCount: 2,
        },
      });
    });

    it("should return 404 for unknown agent type", async () => {
      vi.mocked(agentRegistry.get).mockReturnValue(undefined);

      const handler = routes.find((r) => r.path === "/:type")?.handler;
      const reply = createMockReply();
      await handler?.({ params: { type: "unknown" } }, reply);

      expect(reply._statusCode).toBe(404);
      expect(reply._body).toEqual({ error: "Agent type not found" });
    });
  });

  describe("GET /:type/status", () => {
    it("should return Claude Code status", async () => {
      const status = {
        type: "claude-code",
        available: true,
        configured: true,
        message: "Ready",
        cliInstalled: true,
        settingsEnabled: true,
        registered: true,
        stub: false,
      };
      vi.mocked(getClaudeRunnerStatus).mockResolvedValue(status);

      const handler = routes.find((r) => r.path === "/:type/status")?.handler;
      const result = await handler?.({ params: { type: "claude-code" } }, createMockReply());

      expect(result).toEqual({ data: status });
    });

    it("should return 404 for unknown agent type", async () => {
      const handler = routes.find((r) => r.path === "/:type/status")?.handler;
      const reply = createMockReply();
      await handler?.({ params: { type: "unknown" } }, reply);

      expect(reply._statusCode).toBe(404);
      expect(reply._body).toEqual({ error: "Unknown agent type: unknown" });
    });
  });
});
