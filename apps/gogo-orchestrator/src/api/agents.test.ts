import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/index.js", () => ({
  getConn: vi.fn(() => ({})),
}));

vi.mock("../db/helpers.js", () => ({
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

vi.mock("../services/agents/openai-codex-runner.js", () => ({
  getCodexRunnerStatus: vi.fn(),
}));

vi.mock("../services/agents/index.js", () => ({
  agentRegistry: {
    has: vi.fn(),
    get: vi.fn(),
  },
  KNOWN_AGENTS: [
    { type: "claude-code", displayName: "Claude Code", description: "Anthropic Claude" },
    { type: "openai-codex", displayName: "OpenAI Codex", description: "OpenAI Codex" },
  ],
}));

import { listAgents } from "../services/agent-executor.js";
import { getClaudeRunnerStatus } from "../services/agents/claude-code-runner.js";
import { agentRegistry } from "../services/agents/index.js";
import { getCodexRunnerStatus } from "../services/agents/openai-codex-runner.js";
import { agentsRouter } from "./agents.js";

interface RouteHandler {
  method: string;
  path: string;
  handler: (request: unknown, reply: unknown) => Promise<unknown>;
}

function createMockFastify() {
  const routes: RouteHandler[] = [];
  const createRouteRegistrar =
    (method: string) => (path: string, handler: (req: unknown, rep: unknown) => Promise<unknown>) => {
      routes.push({ method, path, handler });
    };
  return {
    routes,
    instance: {
      get: createRouteRegistrar("GET"),
      post: createRouteRegistrar("POST"),
    },
  };
}

function createMockReply() {
  const reply = {
    _statusCode: 200,
    _body: null as unknown,
    status(code: number) {
      reply._statusCode = code;
      return reply;
    },
    send(body: unknown) {
      reply._body = body;
      return body;
    },
  };
  return reply;
}

describe("agents API", () => {
  let routes: RouteHandler[];

  beforeEach(async () => {
    vi.clearAllMocks();

    const mock = createMockFastify();
    routes = mock.routes;
    await agentsRouter(mock.instance as never, {} as never);
  });

  describe("GET / (list agents)", () => {
    it("should return registered agents", async () => {
      const agents = [{ type: "claude-code", displayName: "Claude Code" }];
      vi.mocked(listAgents).mockReturnValue(agents as never);

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
      vi.mocked(getCodexRunnerStatus).mockResolvedValue({
        type: "openai-codex",
        available: false,
        configured: false,
        message: "Not configured",
        featureFlagEnabled: false,
        apiKeySet: false,
        cliInstalled: false,
        registered: false,
        stub: false,
      });

      const handler = routes.find((r) => r.path === "/all")?.handler;
      const result = (await handler?.({}, createMockReply())) as { data: unknown[] };

      expect(result.data).toHaveLength(2);
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
      vi.mocked(agentRegistry.get).mockReturnValue(mockRunner as never);

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

    it("should return OpenAI Codex status", async () => {
      const status = {
        type: "openai-codex",
        available: false,
        configured: false,
        message: "Not configured",
        featureFlagEnabled: false,
        apiKeySet: false,
        cliInstalled: false,
        registered: false,
        stub: false,
      };
      vi.mocked(getCodexRunnerStatus).mockResolvedValue(status);

      const handler = routes.find((r) => r.path === "/:type/status")?.handler;
      const result = await handler?.({ params: { type: "openai-codex" } }, createMockReply());

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
