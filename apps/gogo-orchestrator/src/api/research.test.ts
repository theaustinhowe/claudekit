import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/index.js", () => ({
  getDb: vi.fn(async () => ({})),
}));

vi.mock("@claudekit/duckdb", () => ({
  queryAll: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
}));

vi.mock("../db/schema.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../db/schema.js")>();
  return {
    ...actual,
    mapResearchSession: vi.fn((row: unknown) => row),
    mapResearchSuggestion: vi.fn((row: unknown) => row),
    mapJob: vi.fn((row: unknown) => row),
    mapSetting: vi.fn((row: unknown) => row),
  };
});

vi.mock("../services/research.js", () => ({
  startResearchSession: vi.fn(),
  cancelResearchSession: vi.fn(),
  getSessionSuggestions: vi.fn(),
}));

vi.mock("../utils/logger.js", () => ({
  createServiceLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { queryAll, queryOne } from "@claudekit/duckdb";
import { cast } from "@claudekit/test-utils";
import { cancelResearchSession, getSessionSuggestions, startResearchSession } from "../services/research.js";
import { createMockFastify, createMockReply, type RouteHandler } from "../test-utils.js";

describe("research API", () => {
  let routes: RouteHandler[];
  let getHandler: (method: string, path: string) => (req: unknown, rep: unknown) => Promise<unknown>;

  beforeEach(async () => {
    vi.clearAllMocks();

    const { researchRouter } = await import("./research.js");
    const mock = createMockFastify();
    routes = mock.routes;
    await researchRouter(cast(mock.instance), cast({}));

    getHandler = (method: string, path: string) => {
      const route = routes.find((r) => r.method === method && r.path === path);
      if (!route) throw new Error(`No route found for ${method} ${path}`);
      return route.handler;
    };
  });

  describe("GET /sessions", () => {
    it("returns sessions with suggestion counts", async () => {
      vi.mocked(queryAll).mockResolvedValueOnce([{ id: "s1", status: "done" }]);
      vi.mocked(queryOne).mockResolvedValueOnce({ count: 5n });

      const handler = getHandler("GET", "/sessions");
      const result = (await handler({}, createMockReply())) as { data: unknown[] };

      expect(result.data).toHaveLength(1);
    });
  });

  describe("GET /:id", () => {
    it("returns session with suggestions", async () => {
      vi.mocked(queryOne).mockResolvedValueOnce({ id: "s1", status: "done" });
      vi.mocked(getSessionSuggestions).mockResolvedValue(cast([{ id: "sg1" }]));

      const handler = getHandler("GET", "/:id");
      const result = (await handler({ params: { id: "s1" } }, createMockReply())) as {
        data: { suggestions: unknown[] };
      };

      expect(result.data.suggestions).toHaveLength(1);
    });

    it("returns 404 when session not found", async () => {
      vi.mocked(queryOne).mockResolvedValueOnce(undefined);

      const handler = getHandler("GET", "/:id");
      const reply = createMockReply();
      await handler({ params: { id: "nonexistent" } }, reply);

      expect(reply._statusCode).toBe(404);
    });
  });

  describe("POST /sessions", () => {
    it("starts a research session", async () => {
      vi.mocked(startResearchSession).mockResolvedValue(cast({ id: "s1", status: "running" }));

      const handler = getHandler("POST", "/sessions");
      const result = await handler(
        {
          body: {
            repositoryId: "550e8400-e29b-41d4-a716-446655440000",
            focusAreas: ["security", "testing"],
          },
        },
        createMockReply(),
      );

      expect(result).toEqual({ data: { id: "s1", status: "running" } });
    });

    it("returns 400 for invalid request", async () => {
      const handler = getHandler("POST", "/sessions");
      const reply = createMockReply();
      await handler({ body: {} }, reply);

      expect(reply._statusCode).toBe(400);
    });
  });

  describe("DELETE /:id", () => {
    it("cancels a research session", async () => {
      vi.mocked(cancelResearchSession).mockResolvedValue(cast(undefined));

      const handler = getHandler("DELETE", "/:id");
      const result = await handler({ params: { id: "s1" } }, createMockReply());

      expect(result).toEqual({ success: true });
    });

    it("returns 400 on cancel error", async () => {
      vi.mocked(cancelResearchSession).mockRejectedValue(new Error("Not running"));

      const handler = getHandler("DELETE", "/:id");
      const reply = createMockReply();
      await handler({ params: { id: "s1" } }, reply);

      expect(reply._statusCode).toBe(400);
    });
  });

  describe("GET /suggestions", () => {
    it("returns filtered suggestions", async () => {
      vi.mocked(queryAll).mockResolvedValueOnce([{ id: "sg1", category: "security" }]);

      const handler = getHandler("GET", "/suggestions");
      const result = (await handler({ query: { category: "security" } }, createMockReply())) as { data: unknown[] };

      expect(result.data).toHaveLength(1);
      expect(vi.mocked(queryAll)).toHaveBeenCalledWith(
        {},
        expect.stringContaining("category = ?"),
        expect.arrayContaining(["security"]),
      );
    });
  });
});
