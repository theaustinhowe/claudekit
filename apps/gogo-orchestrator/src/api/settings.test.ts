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

vi.mock("../db/schema.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../db/schema.js")>();
  return {
    ...actual,
    mapSetting: vi.fn((row: unknown) => row),
  };
});

import { execute, queryAll } from "@claudekit/duckdb";
import { cast } from "@claudekit/test-utils";
import { mapSetting } from "../db/schema.js";
import { createMockFastify, type RouteHandler } from "../test-utils.js";
import { settingsRouter } from "./settings.js";

describe("settings API", () => {
  let routes: RouteHandler[];

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(execute).mockResolvedValue(undefined);

    vi.mocked(mapSetting).mockImplementation((row: unknown) => {
      const r = row as { key: string; value: string; updated_at: string };
      return {
        key: r.key,
        value: JSON.parse(r.value),
        updatedAt: new Date(r.updated_at),
      };
    });

    const mock = createMockFastify();
    routes = mock.routes;
    await settingsRouter(cast(mock.instance), cast({}));
  });

  describe("GET / (get all settings)", () => {
    it("should return settings in frontend format", async () => {
      vi.mocked(queryAll).mockResolvedValue([
        { key: "github_token", value: '{"token":"ghp_abc123"}', updated_at: "2024-01-01T00:00:00Z" },
        { key: "workdir", value: '{"path":"/tmp/work"}', updated_at: "2024-01-01T00:00:00Z" },
        { key: "max_parallel_jobs", value: '{"count":3}', updated_at: "2024-01-01T00:00:00Z" },
      ]);

      const handler = routes.find((r) => r.method === "GET" && r.path === "/")?.handler;
      const result = (await handler?.({}, {})) as { data: Record<string, unknown> };

      expect(result.data).toEqual({
        personalAccessToken: "ghp_abc123",
        workDirectory: "/tmp/work",
        maxParallelJobs: 3,
      });
    });

    it("should return empty when no settings exist", async () => {
      vi.mocked(queryAll).mockResolvedValue([]);

      const handler = routes.find((r) => r.method === "GET" && r.path === "/")?.handler;
      const result = (await handler?.({}, {})) as { data: Record<string, unknown> };

      expect(result.data).toEqual({});
    });
  });

  describe("PUT / (update settings)", () => {
    it("should transform frontend keys to stored format and upsert", async () => {
      // Existing settings query
      vi.mocked(queryAll).mockResolvedValue([]);

      const handler = routes.find((r) => r.method === "PUT" && r.path === "/")?.handler;
      const result = await handler?.(
        {
          body: {
            personalAccessToken: "ghp_new",
            workDirectory: "/home/user/work",
            maxParallelJobs: 5,
          },
        },
        {},
      );

      // Should upsert each stored key
      expect(execute).toHaveBeenCalledTimes(3);

      // Check github_token upsert
      const ghTokenCall = vi.mocked(execute).mock.calls.find((call) => call[2]?.includes("github_token"));
      expect(ghTokenCall).toBeDefined();
      expect(ghTokenCall?.[2]).toContain(JSON.stringify({ token: "ghp_new" }));

      // Check workdir upsert
      const workdirCall = vi.mocked(execute).mock.calls.find((call) => call[2]?.includes("workdir"));
      expect(workdirCall).toBeDefined();
      expect(workdirCall?.[2]).toContain(JSON.stringify({ path: "/home/user/work" }));

      // Should return the frontend body as-is
      expect(result).toEqual({
        data: {
          personalAccessToken: "ghp_new",
          workDirectory: "/home/user/work",
          maxParallelJobs: 5,
        },
      });
    });

    it("should merge with existing stored values", async () => {
      vi.mocked(queryAll).mockResolvedValue([
        { key: "github_token", value: '{"token":"ghp_old","extra":"data"}', updated_at: "2024-01-01T00:00:00Z" },
      ]);

      const handler = routes.find((r) => r.method === "PUT" && r.path === "/")?.handler;
      await handler?.({ body: { personalAccessToken: "ghp_new" } }, {});

      const ghTokenCall = vi.mocked(execute).mock.calls.find((call) => call[2]?.includes("github_token"));
      expect(ghTokenCall).toBeDefined();
      // Should preserve "extra" field from existing value while updating "token"
      const storedValue = JSON.parse(ghTokenCall?.[2]?.[1] as string);
      expect(storedValue.token).toBe("ghp_new");
      expect(storedValue.extra).toBe("data");
    });

    it("should ignore unknown frontend keys", async () => {
      vi.mocked(queryAll).mockResolvedValue([]);

      const handler = routes.find((r) => r.method === "PUT" && r.path === "/")?.handler;
      await handler?.({ body: { unknownKey: "value" } }, {});

      // No upsert should be made for unknown keys
      expect(execute).not.toHaveBeenCalled();
    });

    it("should use ON CONFLICT for upsert", async () => {
      vi.mocked(queryAll).mockResolvedValue([]);

      const handler = routes.find((r) => r.method === "PUT" && r.path === "/")?.handler;
      await handler?.({ body: { workDirectory: "/new/path" } }, {});

      expect(execute).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining("ON CONFLICT"),
        expect.any(Array),
      );
    });
  });
});
