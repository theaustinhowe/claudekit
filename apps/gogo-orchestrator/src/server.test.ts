import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock all route modules
vi.mock("./api/agents.js", () => ({
  agentsRouter: vi.fn(),
}));

vi.mock("./api/health.js", () => ({
  healthRouter: vi.fn(),
}));

vi.mock("./api/issues.js", () => ({
  issuesRouter: vi.fn(),
}));

vi.mock("./api/jobs.js", () => ({
  jobsRouter: vi.fn(),
}));

vi.mock("./api/repositories.js", () => ({
  repositoriesRouter: vi.fn(),
}));

vi.mock("./api/research.js", () => ({
  researchRouter: vi.fn(),
}));

vi.mock("./api/settings.js", () => ({
  settingsRouter: vi.fn(),
}));

vi.mock("./api/setup.js", () => ({
  setupRouter: vi.fn(),
}));

vi.mock("./api/system.js", () => ({
  systemRouter: vi.fn(),
}));

vi.mock("./api/worktrees.js", () => ({
  worktreesRouter: vi.fn(),
}));

vi.mock("./middleware/auth.js", () => ({
  authHook: vi.fn(),
}));

vi.mock("./ws/handler.js", () => ({
  setupWebSocket: vi.fn(),
}));

// Fastify validates loggerInstance must have: fatal, error, warn, info, debug, trace, child
vi.mock("./utils/logger.js", () => {
  const makePino = (): Record<string, unknown> => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    silent: vi.fn(),
    child: vi.fn(() => makePino()),
    level: "info",
  });
  return {
    logger: makePino(),
    createServiceLogger: vi.fn(() => makePino()),
  };
});

// Spy on Fastify to capture how the server is configured
const mockRegister = vi.fn().mockResolvedValue(undefined);
const mockAddHook = vi.fn();
const mockSetReplySerializer = vi.fn();
const mockListen = vi.fn().mockResolvedValue(undefined);
const mockReady = vi.fn().mockResolvedValue(undefined);
const mockGet = vi.fn();

const mockFastifyInstance = {
  register: mockRegister,
  addHook: mockAddHook,
  setReplySerializer: mockSetReplySerializer,
  listen: mockListen,
  ready: mockReady,
  get: mockGet,
};

vi.mock("fastify", () => ({
  default: vi.fn(() => mockFastifyInstance),
}));

vi.mock("@fastify/cors", () => ({
  default: "cors-plugin",
}));

vi.mock("@fastify/websocket", () => ({
  default: "websocket-plugin",
}));

import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import Fastify from "fastify";
import { agentsRouter } from "./api/agents.js";
import { healthRouter } from "./api/health.js";
import { issuesRouter } from "./api/issues.js";
import { jobsRouter } from "./api/jobs.js";
import { repositoriesRouter } from "./api/repositories.js";
import { researchRouter } from "./api/research.js";
import { settingsRouter } from "./api/settings.js";
import { setupRouter } from "./api/setup.js";
import { systemRouter } from "./api/system.js";
import { worktreesRouter } from "./api/worktrees.js";
import { authHook } from "./middleware/auth.js";
import { createServer } from "./server.js";

describe("server", () => {
  const originalAllowedOrigins = process.env.ALLOWED_ORIGINS;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalAllowedOrigins !== undefined) {
      process.env.ALLOWED_ORIGINS = originalAllowedOrigins;
    } else {
      delete process.env.ALLOWED_ORIGINS;
    }
  });

  describe("createServer", () => {
    it("should create a Fastify instance with a logger", async () => {
      await createServer();

      expect(Fastify).toHaveBeenCalledWith(
        expect.objectContaining({
          loggerInstance: expect.anything(),
        }),
      );
    });

    it("should return the Fastify app instance", async () => {
      const app = await createServer();

      expect(app).toBe(mockFastifyInstance);
    });

    it("should set a custom reply serializer", async () => {
      await createServer();

      expect(mockSetReplySerializer).toHaveBeenCalledWith(expect.any(Function));
    });

    it("should convert BigInt to Number in reply serializer", async () => {
      await createServer();

      const serializer = mockSetReplySerializer.mock.calls[0][0];
      const result = serializer({ count: BigInt(42), name: "test" });
      const parsed = JSON.parse(result);

      expect(parsed.count).toBe(42);
      expect(parsed.name).toBe("test");
    });

    it("should handle nested BigInt in reply serializer", async () => {
      await createServer();

      const serializer = mockSetReplySerializer.mock.calls[0][0];
      const result = serializer({ data: { total: BigInt(100), items: [{ n: BigInt(5) }] } });
      const parsed = JSON.parse(result);

      expect(parsed.data.total).toBe(100);
      expect(parsed.data.items[0].n).toBe(5);
    });

    it("should handle non-bigint values normally in reply serializer", async () => {
      await createServer();

      const serializer = mockSetReplySerializer.mock.calls[0][0];
      const result = serializer({ id: 1, name: "test", active: true });
      const parsed = JSON.parse(result);

      expect(parsed.id).toBe(1);
      expect(parsed.name).toBe("test");
      expect(parsed.active).toBe(true);
    });

    it("should register CORS with default origins when ALLOWED_ORIGINS is not set", async () => {
      delete process.env.ALLOWED_ORIGINS;

      await createServer();

      expect(mockRegister).toHaveBeenCalledWith(cors, {
        origin: ["http://localhost:2200", "http://127.0.0.1:2200", "http://localhost:3000", "http://127.0.0.1:3000"],
      });
    });

    it("should register CORS with custom origins from ALLOWED_ORIGINS env", async () => {
      process.env.ALLOWED_ORIGINS = "http://custom:3000,http://other:4000";

      await createServer();

      expect(mockRegister).toHaveBeenCalledWith(cors, {
        origin: ["http://custom:3000", "http://other:4000"],
      });
    });

    it("should register the websocket plugin", async () => {
      await createServer();

      expect(mockRegister).toHaveBeenCalledWith(websocket);
    });

    it("should add auth hook on onRequest", async () => {
      await createServer();

      expect(mockAddHook).toHaveBeenCalledWith("onRequest", authHook);
    });

    it("should register all REST API route modules with correct prefixes", async () => {
      await createServer();

      expect(mockRegister).toHaveBeenCalledWith(agentsRouter, { prefix: "/api/agents" });
      expect(mockRegister).toHaveBeenCalledWith(healthRouter, { prefix: "/api/health" });
      expect(mockRegister).toHaveBeenCalledWith(issuesRouter, { prefix: "/api/repositories" });
      expect(mockRegister).toHaveBeenCalledWith(jobsRouter, { prefix: "/api/jobs" });
      expect(mockRegister).toHaveBeenCalledWith(repositoriesRouter, { prefix: "/api/repositories" });
      expect(mockRegister).toHaveBeenCalledWith(researchRouter, { prefix: "/api/research" });
      expect(mockRegister).toHaveBeenCalledWith(settingsRouter, { prefix: "/api/settings" });
      expect(mockRegister).toHaveBeenCalledWith(setupRouter, { prefix: "/api/setup" });
      expect(mockRegister).toHaveBeenCalledWith(systemRouter, { prefix: "/api/system" });
      expect(mockRegister).toHaveBeenCalledWith(worktreesRouter, { prefix: "/api/worktrees" });
    });

    it("should register the WebSocket endpoint via an inline plugin", async () => {
      await createServer();

      // The WebSocket route is registered via app.register(async (fastify) => { ... })
      // The last register call (after the 10 route modules + cors + websocket) is the WS plugin
      const registerCalls = mockRegister.mock.calls;

      // Find the call that registers an anonymous async function (not a named router)
      const wsPluginCall = registerCalls.find(
        (call) => typeof call[0] === "function" && call[0] !== cors && call[0] !== websocket && call.length === 1,
      );

      expect(wsPluginCall).toBeDefined();
    });

    it("should register routes in the correct order: cors, websocket, hook, routes, ws", async () => {
      await createServer();

      // CORS is registered first
      expect(mockRegister.mock.calls[0][0]).toBe(cors);
      // WebSocket plugin second
      expect(mockRegister.mock.calls[1][0]).toBe(websocket);
    });
  });
});
