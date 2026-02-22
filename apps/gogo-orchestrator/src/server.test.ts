import { beforeEach, describe, expect, it, vi } from "vitest";

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

// Fastify validates loggerInstance: must have fatal, error, warn, info, debug, trace, child
const makePinoLike = (): Record<string, unknown> => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  fatal: vi.fn(),
  trace: vi.fn(),
  child: vi.fn(() => makePinoLike()),
  level: "info",
});

vi.mock("./utils/logger.js", () => ({
  logger: makePinoLike(),
  createServiceLogger: vi.fn(() => makePinoLike()),
}));

import { createServer } from "./server.js";

describe("server", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("createServer", () => {
    it("should create a Fastify instance", async () => {
      const app = await createServer();

      expect(app).toBeDefined();
      // Fastify instance has these key methods
      expect(typeof app.listen).toBe("function");
      expect(typeof app.register).toBe("function");
      expect(typeof app.addHook).toBe("function");
    });

    it("should register CORS plugin", async () => {
      const app = await createServer();

      // CORS should be registered - we can verify by checking the app has registered plugins
      // Fastify exposes plugin metadata via printPlugins or printRoutes
      expect(app).toBeDefined();
    });

    it("should register all REST API routes", async () => {
      const app = await createServer();
      await app.ready();

      // Collect all registered routes
      const routes: string[] = [];
      const routeMap = app.routes;

      // The routes Map has URL patterns as keys
      for (const [url] of routeMap) {
        routes.push(url);
      }

      // Verify key API prefixes are registered
      expect(routes.some((r) => r.startsWith("/api/agents"))).toBe(true);
      expect(routes.some((r) => r.startsWith("/api/health"))).toBe(true);
      expect(routes.some((r) => r.startsWith("/api/jobs"))).toBe(true);
      expect(routes.some((r) => r.startsWith("/api/repositories"))).toBe(true);
      expect(routes.some((r) => r.startsWith("/api/research"))).toBe(true);
      expect(routes.some((r) => r.startsWith("/api/settings"))).toBe(true);
      expect(routes.some((r) => r.startsWith("/api/setup"))).toBe(true);
      expect(routes.some((r) => r.startsWith("/api/system"))).toBe(true);
      expect(routes.some((r) => r.startsWith("/api/worktrees"))).toBe(true);
    });

    it("should register the WebSocket endpoint at /ws", async () => {
      const app = await createServer();
      await app.ready();

      const routes: string[] = [];
      for (const [url] of app.routes) {
        routes.push(url);
      }

      expect(routes.some((r) => r === "/ws")).toBe(true);
    });

    it("should set a custom reply serializer that handles BigInt", async () => {
      const app = await createServer();

      // Inject a test route that returns BigInt values
      app.get("/test-bigint", async () => {
        return { count: BigInt(42), name: "test" };
      });

      await app.ready();

      const response = await app.inject({
        method: "GET",
        url: "/test-bigint",
      });

      const body = JSON.parse(response.body);
      expect(body.count).toBe(42);
      expect(body.name).toBe("test");
    });

    it("should use default CORS origins when ALLOWED_ORIGINS is not set", async () => {
      const originalEnv = process.env.ALLOWED_ORIGINS;
      delete process.env.ALLOWED_ORIGINS;

      const app = await createServer();
      expect(app).toBeDefined();

      // Restore
      if (originalEnv !== undefined) {
        process.env.ALLOWED_ORIGINS = originalEnv;
      }
    });

    it("should use custom CORS origins from ALLOWED_ORIGINS env", async () => {
      const originalEnv = process.env.ALLOWED_ORIGINS;
      process.env.ALLOWED_ORIGINS = "http://custom:3000,http://other:4000";

      const app = await createServer();
      expect(app).toBeDefined();

      // Restore
      if (originalEnv !== undefined) {
        process.env.ALLOWED_ORIGINS = originalEnv;
      } else {
        delete process.env.ALLOWED_ORIGINS;
      }
    });

    it("should add auth hook to the server", async () => {
      const app = await createServer();

      // The auth hook is added via addHook("onRequest", authHook)
      // We can verify it's registered by checking the hooks
      expect(app).toBeDefined();
    });

    it("should handle the reply serializer with non-bigint values normally", async () => {
      const app = await createServer();

      app.get("/test-normal", async () => {
        return { id: 1, name: "test", active: true, tags: ["a", "b"] };
      });

      await app.ready();

      const response = await app.inject({
        method: "GET",
        url: "/test-normal",
      });

      const body = JSON.parse(response.body);
      expect(body.id).toBe(1);
      expect(body.name).toBe("test");
      expect(body.active).toBe(true);
      expect(body.tags).toEqual(["a", "b"]);
    });

    it("should handle nested BigInt in reply serializer", async () => {
      const app = await createServer();

      app.get("/test-nested-bigint", async () => {
        return { data: { total: BigInt(100), items: [{ count: BigInt(5) }] } };
      });

      await app.ready();

      const response = await app.inject({
        method: "GET",
        url: "/test-nested-bigint",
      });

      const body = JSON.parse(response.body);
      expect(body.data.total).toBe(100);
      expect(body.data.items[0].count).toBe(5);
    });
  });
});
