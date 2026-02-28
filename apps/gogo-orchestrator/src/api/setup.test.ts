import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
  statSync: vi.fn(),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

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
    mapRepositoryFull: vi.fn((row: unknown) => row),
  };
});

vi.mock("octokit", () => ({
  Octokit: vi.fn(),
}));

import { queryAll } from "@claudekit/duckdb";
import { cast } from "@claudekit/test-utils";
import { createMockFastify, createMockReply, type RouteHandler } from "../test-utils.js";

describe("setup API", () => {
  let routes: RouteHandler[];
  let getHandler: (path: string) => (req: unknown, rep: unknown) => Promise<unknown>;

  beforeEach(async () => {
    vi.clearAllMocks();

    const { setupRouter } = await import("./setup.js");
    const mock = createMockFastify();
    routes = mock.routes;
    await setupRouter(cast(mock.instance), cast({}));

    getHandler = (path: string) => {
      const route = routes.find((r) => r.path === path);
      if (!route) throw new Error(`No route found for path: ${path}`);
      return route.handler;
    };
  });

  describe("GET /status", () => {
    it("returns needsSetup: true when no active repos", async () => {
      vi.mocked(queryAll).mockResolvedValueOnce([]);

      const handler = getHandler("/status");
      const result = (await handler({}, createMockReply())) as { needsSetup: boolean; repositoryCount: number };

      expect(result.needsSetup).toBe(true);
      expect(result.repositoryCount).toBe(0);
    });

    it("returns needsSetup: false when repos exist", async () => {
      vi.mocked(queryAll).mockResolvedValueOnce([{ id: "r1" }]);

      const handler = getHandler("/status");
      const result = (await handler({}, createMockReply())) as { needsSetup: boolean; repositoryCount: number };

      expect(result.needsSetup).toBe(false);
      expect(result.repositoryCount).toBe(1);
    });
  });

  describe("POST /verify-github", () => {
    it("returns 400 for missing token", async () => {
      const handler = getHandler("/verify-github");
      const reply = createMockReply();
      await handler({ body: {} }, reply);

      expect(reply._statusCode).toBe(400);
    });
  });

  describe("POST /verify-workspace", () => {
    it("returns 400 for missing path", async () => {
      const handler = getHandler("/verify-workspace");
      const reply = createMockReply();
      await handler({ body: {} }, reply);

      expect(reply._statusCode).toBe(400);
    });
  });

  describe("POST /browse-directory", () => {
    it("returns 400 for missing path", async () => {
      const handler = getHandler("/browse-directory");
      const reply = createMockReply();
      await handler({ body: {} }, reply);

      expect(reply._statusCode).toBe(400);
    });
  });

  describe("POST /discover-repos", () => {
    it("returns 400 for missing path", async () => {
      const handler = getHandler("/discover-repos");
      const reply = createMockReply();
      await handler({ body: {} }, reply);

      expect(reply._statusCode).toBe(400);
    });
  });

  describe("POST /complete", () => {
    it("returns 400 for missing required fields", async () => {
      const handler = getHandler("/complete");
      const reply = createMockReply();
      await handler({ body: {} }, reply);

      expect(reply._statusCode).toBe(400);
    });

    it("returns 400 when no token source provided", async () => {
      const handler = getHandler("/complete");
      const reply = createMockReply();
      await handler(
        {
          body: {
            owner: "test-owner",
            name: "test-repo",
            workdirPath: "/tmp/work",
          },
        },
        reply,
      );

      expect(reply._statusCode).toBe(400);
    });
  });
});
