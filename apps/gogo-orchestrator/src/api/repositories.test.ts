import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/index.js", () => ({
  getDb: vi.fn(async () => ({})),
}));

vi.mock("@claudekit/duckdb", () => ({
  queryAll: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
  buildUpdate: vi.fn(),
}));

vi.mock("../db/schema.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../db/schema.js")>();
  return {
    ...actual,
    mapJob: vi.fn((row: unknown) => row),
    mapRepositoryFull: vi.fn((row: unknown) => row),
  };
});

vi.mock("../services/github/index.js", () => ({
  getOctokitForRepo: vi.fn(),
}));

vi.mock("../utils/logger.js", () => ({
  createServiceLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock("../utils/timeout.js", () => ({
  withTimeout: vi.fn(async (promise: Promise<unknown>) => promise),
  TIMEOUTS: { GITHUB_API: 10000 },
}));

import { buildUpdate, execute, queryAll, queryOne } from "@claudekit/duckdb";
import { mapJob, mapRepositoryFull } from "../db/schema.js";
import { getOctokitForRepo } from "../services/github/index.js";
import { createMockFastify, createMockReply, type RouteHandler } from "../test-utils.js";
import { repositoriesRouter, toSnakeCaseFields } from "./repositories.js";

const mockRepo = {
  id: "repo-1",
  owner: "org",
  name: "repo",
  displayName: "Test Repo",
  githubToken: "ghp_test123",
  baseBranch: "main",
  triggerLabel: "agent",
  workdirPath: "/tmp/workdir",
  isActive: true,
  autoCreateJobs: true,
  autoStartJobs: true,
  autoCreatePr: true,
  removeLabelAfterCreate: false,
  pollIntervalMs: 30000,
  testCommand: "npm test",
  agentProvider: "claude-code",
  branchPattern: null,
  autoCleanup: false,
};

describe("repositories API", () => {
  let routes: RouteHandler[];
  let getRoute: (method: string, path: string) => (req: unknown, rep: unknown) => Promise<unknown>;

  beforeEach(async () => {
    vi.clearAllMocks();

    vi.mocked(mapRepositoryFull).mockImplementation((row: unknown) => row as ReturnType<typeof mapRepositoryFull>);
    vi.mocked(mapJob).mockImplementation((row: unknown) => row as ReturnType<typeof mapJob>);
    vi.mocked(execute).mockResolvedValue(undefined);

    const mock = createMockFastify();
    routes = mock.routes;
    await repositoriesRouter(mock.instance as never, {} as never);

    getRoute = (method: string, path: string) => {
      const route = routes.find((r) => r.method === method && r.path === path);
      if (!route) throw new Error(`No route: ${method} ${path}`);
      return route.handler;
    };
  });

  describe("toSnakeCaseFields", () => {
    it("should convert camelCase keys to snake_case", () => {
      const result = toSnakeCaseFields({
        displayName: "Test",
        githubToken: "tok",
        baseBranch: "main",
        triggerLabel: "agent",
        workdirPath: "/tmp",
        isActive: true,
        autoCreateJobs: true,
        autoStartJobs: false,
        autoCreatePr: true,
        removeLabelAfterCreate: false,
      });

      expect(result).toEqual({
        display_name: "Test",
        github_token: "tok",
        base_branch: "main",
        trigger_label: "agent",
        workdir_path: "/tmp",
        is_active: true,
        auto_create_jobs: true,
        auto_start_jobs: false,
        auto_create_pr: true,
        remove_label_after_create: false,
      });
    });

    it("should skip undefined values", () => {
      const result = toSnakeCaseFields({
        displayName: "Test",
        githubToken: undefined,
      });

      expect(result).toEqual({ display_name: "Test" });
      expect("github_token" in result).toBe(false);
    });

    it("should pass through unmapped keys", () => {
      const result = toSnakeCaseFields({ unknownKey: "value" });
      expect(result).toEqual({ unknownKey: "value" });
    });
  });

  describe("GET / (list repositories)", () => {
    it("should return repositories with masked tokens", async () => {
      vi.mocked(queryAll).mockResolvedValueOnce([mockRepo]);

      const handler = getRoute("GET", "/");
      const result = (await handler({}, createMockReply())) as { data: Array<{ githubToken: string }> };

      expect(result.data).toHaveLength(1);
      expect(result.data[0].githubToken).toBe("***");
    });

    it("should return null for repos without tokens", async () => {
      vi.mocked(queryAll).mockResolvedValueOnce([{ ...mockRepo, githubToken: null }]);

      const handler = getRoute("GET", "/");
      const result = (await handler({}, createMockReply())) as { data: Array<{ githubToken: string | null }> };

      expect(result.data[0].githubToken).toBeNull();
    });

    it("should return empty array when no repos", async () => {
      vi.mocked(queryAll).mockResolvedValueOnce([]);

      const handler = getRoute("GET", "/");
      const result = (await handler({}, createMockReply())) as { data: unknown[] };

      expect(result.data).toHaveLength(0);
    });
  });

  describe("GET /:id (single repository)", () => {
    it("should return 404 when repo not found", async () => {
      vi.mocked(queryOne).mockResolvedValueOnce(undefined);

      const handler = getRoute("GET", "/:id");
      const reply = createMockReply();
      await handler({ params: { id: "nonexistent" } }, reply);

      expect(reply._statusCode).toBe(404);
    });

    it("should return repo with masked token", async () => {
      vi.mocked(queryOne).mockResolvedValueOnce(mockRepo);

      const handler = getRoute("GET", "/:id");
      const result = (await handler({ params: { id: "repo-1" } }, createMockReply())) as {
        data: { githubToken: string };
      };

      expect(result.data.githubToken).toBe("***");
    });
  });

  describe("POST / (create repository)", () => {
    const validBody = {
      owner: "org",
      name: "new-repo",
      githubToken: "ghp_token",
      workdirPath: "/tmp/work",
    };

    it("should return 400 for invalid body", async () => {
      const handler = getRoute("POST", "/");
      const reply = createMockReply();
      await handler({ body: {} }, reply);

      expect(reply._statusCode).toBe(400);
      expect(reply._body).toEqual(expect.objectContaining({ error: "Invalid request body" }));
    });

    it("should create repository successfully", async () => {
      vi.mocked(queryOne).mockResolvedValueOnce({ ...mockRepo, id: "new-id" });

      const handler = getRoute("POST", "/");
      const result = (await handler({ body: validBody }, createMockReply())) as {
        data: { githubToken: string; id: string };
      };

      expect(result.data.githubToken).toBe("***");
      expect(queryOne).toHaveBeenCalled();
    });

    it("should return 500 when insert fails", async () => {
      vi.mocked(queryOne).mockResolvedValueOnce(undefined);

      const handler = getRoute("POST", "/");
      const reply = createMockReply();
      await handler({ body: validBody }, reply);

      expect(reply._statusCode).toBe(500);
    });
  });

  describe("PATCH /:id (update repository)", () => {
    it("should return 400 for invalid body", async () => {
      const handler = getRoute("PATCH", "/:id");
      const reply = createMockReply();
      await handler({ params: { id: "repo-1" }, body: { githubToken: "" } }, reply);

      expect(reply._statusCode).toBe(400);
    });

    it("should return 404 when repo not found", async () => {
      vi.mocked(queryOne).mockResolvedValueOnce(undefined);

      const handler = getRoute("PATCH", "/:id");
      const reply = createMockReply();
      await handler({ params: { id: "nonexistent" }, body: { displayName: "New Name" } }, reply);

      expect(reply._statusCode).toBe(404);
    });

    it("should return 400 when no valid fields", async () => {
      vi.mocked(queryOne).mockResolvedValueOnce(mockRepo);
      vi.mocked(buildUpdate).mockReturnValueOnce(null as never);

      const handler = getRoute("PATCH", "/:id");
      const reply = createMockReply();
      await handler({ params: { id: "repo-1" }, body: { displayName: "New" } }, reply);

      expect(reply._statusCode).toBe(400);
    });

    it("should update repository successfully", async () => {
      vi.mocked(queryOne)
        .mockResolvedValueOnce(mockRepo) // exists check
        .mockResolvedValueOnce({ ...mockRepo, displayName: "Updated" }); // update result

      vi.mocked(buildUpdate).mockReturnValueOnce({
        sql: "UPDATE repositories SET display_name = ? WHERE id = ?",
        params: ["Updated", "repo-1"],
      } as never);

      const handler = getRoute("PATCH", "/:id");
      const result = (await handler(
        { params: { id: "repo-1" }, body: { displayName: "Updated" } },
        createMockReply(),
      )) as {
        data: { githubToken: string };
      };

      expect(result.data.githubToken).toBe("***");
    });
  });

  describe("DELETE /:id", () => {
    it("should return 404 when repo not found", async () => {
      vi.mocked(queryOne).mockResolvedValueOnce(undefined);

      const handler = getRoute("DELETE", "/:id");
      const reply = createMockReply();
      await handler({ params: { id: "nonexistent" }, query: {} }, reply);

      expect(reply._statusCode).toBe(404);
    });

    it("should block deletion when running jobs exist", async () => {
      vi.mocked(queryOne).mockResolvedValueOnce(mockRepo);
      vi.mocked(queryAll).mockResolvedValueOnce([{ status: "running", count: BigInt(2) }]);

      const handler = getRoute("DELETE", "/:id");
      const reply = createMockReply();
      await handler({ params: { id: "repo-1" }, query: {} }, reply);

      expect(reply._statusCode).toBe(409);
      expect(reply._body).toEqual(expect.objectContaining({ error: "Cannot delete repository with running jobs" }));
    });

    it("should warn when jobs exist without confirm", async () => {
      vi.mocked(queryOne).mockResolvedValueOnce(mockRepo);
      vi.mocked(queryAll).mockResolvedValueOnce([{ status: "done", count: BigInt(5) }]);

      const handler = getRoute("DELETE", "/:id");
      const reply = createMockReply();
      await handler({ params: { id: "repo-1" }, query: {} }, reply);

      expect(reply._statusCode).toBe(409);
      expect(reply._body).toEqual(expect.objectContaining({ error: "Repository has associated jobs" }));
    });

    it("should delete with confirm when jobs exist", async () => {
      vi.mocked(queryOne).mockResolvedValueOnce(mockRepo);
      vi.mocked(queryAll).mockResolvedValueOnce([{ status: "done", count: BigInt(3) }]);

      const handler = getRoute("DELETE", "/:id");
      const result = (await handler({ params: { id: "repo-1" }, query: { confirm: "true" } }, createMockReply())) as {
        success: boolean;
        orphanedJobs: number;
      };

      expect(result.success).toBe(true);
      expect(result.orphanedJobs).toBe(3);
      expect(execute).toHaveBeenCalledTimes(2); // orphan jobs + delete repo
    });

    it("should delete when no jobs exist", async () => {
      vi.mocked(queryOne).mockResolvedValueOnce(mockRepo);
      vi.mocked(queryAll).mockResolvedValueOnce([]);

      const handler = getRoute("DELETE", "/:id");
      const result = (await handler({ params: { id: "repo-1" }, query: {} }, createMockReply())) as {
        success: boolean;
        orphanedJobs: number;
      };

      expect(result.success).toBe(true);
      expect(result.orphanedJobs).toBe(0);
    });
  });

  describe("GET /active", () => {
    it("should return only active repositories with masked tokens", async () => {
      vi.mocked(queryAll).mockResolvedValueOnce([mockRepo]);

      const handler = getRoute("GET", "/active");
      const result = (await handler({}, createMockReply())) as { data: Array<{ githubToken: string }> };

      expect(result.data).toHaveLength(1);
      expect(result.data[0].githubToken).toBe("***");
    });
  });

  describe("GET /:id/jobs", () => {
    it("should return 404 when repo not found", async () => {
      vi.mocked(queryOne).mockResolvedValueOnce(undefined);

      const handler = getRoute("GET", "/:id/jobs");
      const reply = createMockReply();
      await handler({ params: { id: "nonexistent" }, query: {} }, reply);

      expect(reply._statusCode).toBe(404);
    });

    it("should return paginated jobs", async () => {
      const jobs = [{ id: "job-1", status: "done", repositoryId: "repo-1" }];
      vi.mocked(queryOne)
        .mockResolvedValueOnce(mockRepo) // repo exists
        .mockResolvedValueOnce({ total: BigInt(1) }); // count

      vi.mocked(queryAll).mockResolvedValueOnce(jobs);

      const handler = getRoute("GET", "/:id/jobs");
      const result = (await handler({ params: { id: "repo-1" }, query: {} }, createMockReply())) as {
        data: unknown[];
        pagination: { total: number };
      };

      expect(result.data).toHaveLength(1);
      expect(result.pagination.total).toBe(1);
    });

    it("should filter by status when provided", async () => {
      vi.mocked(queryOne)
        .mockResolvedValueOnce(mockRepo)
        .mockResolvedValueOnce({ total: BigInt(0) });
      vi.mocked(queryAll).mockResolvedValueOnce([]);

      const handler = getRoute("GET", "/:id/jobs");
      await handler({ params: { id: "repo-1" }, query: { status: "running" } }, createMockReply());

      expect(queryAll).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining("status = ?"),
        expect.arrayContaining(["running"]),
      );
    });
  });

  describe("GET /:id/settings", () => {
    it("should return 404 when repo not found", async () => {
      vi.mocked(queryOne).mockResolvedValueOnce(undefined);

      const handler = getRoute("GET", "/:id/settings");
      const reply = createMockReply();
      await handler({ params: { id: "nonexistent" } }, reply);

      expect(reply._statusCode).toBe(404);
    });

    it("should return repo settings", async () => {
      vi.mocked(queryOne).mockResolvedValueOnce(mockRepo);

      const handler = getRoute("GET", "/:id/settings");
      const result = (await handler({ params: { id: "repo-1" } }, createMockReply())) as {
        data: { pollIntervalMs: number; agentProvider: string };
      };

      expect(result.data.pollIntervalMs).toBe(30000);
      expect(result.data.agentProvider).toBe("claude-code");
    });
  });

  describe("PATCH /:id/settings", () => {
    it("should return 400 for invalid body", async () => {
      const handler = getRoute("PATCH", "/:id/settings");
      const reply = createMockReply();
      await handler({ params: { id: "repo-1" }, body: { pollIntervalMs: 100 } }, reply);

      expect(reply._statusCode).toBe(400);
    });

    it("should return 404 when repo not found", async () => {
      vi.mocked(queryOne).mockResolvedValueOnce(undefined);

      const handler = getRoute("PATCH", "/:id/settings");
      const reply = createMockReply();
      await handler({ params: { id: "nonexistent" }, body: { pollIntervalMs: 30000 } }, reply);

      expect(reply._statusCode).toBe(404);
    });

    it("should update settings successfully", async () => {
      vi.mocked(queryOne)
        .mockResolvedValueOnce(mockRepo) // exists check
        .mockResolvedValueOnce({ ...mockRepo, pollIntervalMs: 60000 }); // update result

      vi.mocked(buildUpdate).mockReturnValueOnce({
        sql: "UPDATE repositories SET poll_interval_ms = ? WHERE id = ?",
        params: [60000, "repo-1"],
      } as never);

      const handler = getRoute("PATCH", "/:id/settings");
      const result = (await handler(
        { params: { id: "repo-1" }, body: { pollIntervalMs: 60000 } },
        createMockReply(),
      )) as { data: { pollIntervalMs: number } };

      expect(result.data.pollIntervalMs).toBe(60000);
    });

    it("should return 400 when no valid fields to update", async () => {
      vi.mocked(queryOne).mockResolvedValueOnce(mockRepo);
      vi.mocked(buildUpdate).mockReturnValueOnce(null as never);

      const handler = getRoute("PATCH", "/:id/settings");
      const reply = createMockReply();
      await handler({ params: { id: "repo-1" }, body: { pollIntervalMs: 30000 } }, reply);

      expect(reply._statusCode).toBe(400);
    });
  });

  describe("GET /:id/branches", () => {
    it("should return 404 when repo not found", async () => {
      vi.mocked(queryOne).mockResolvedValueOnce(undefined);

      const handler = getRoute("GET", "/:id/branches");
      const reply = createMockReply();
      await handler({ params: { id: "nonexistent" } }, reply);

      expect(reply._statusCode).toBe(404);
    });

    it("should return branches sorted with default first", async () => {
      vi.mocked(queryOne).mockResolvedValueOnce(mockRepo);
      vi.mocked(getOctokitForRepo).mockResolvedValueOnce({
        rest: {
          repos: {
            listBranches: vi.fn().mockResolvedValueOnce({
              data: [
                { name: "develop", protected: false },
                { name: "main", protected: true },
              ],
            }),
            get: vi.fn().mockResolvedValueOnce({
              data: { default_branch: "main" },
            }),
          },
        },
      } as never);

      const handler = getRoute("GET", "/:id/branches");
      const result = (await handler({ params: { id: "repo-1" } }, createMockReply())) as {
        data: Array<{ name: string; isDefault: boolean }>;
        defaultBranch: string;
      };

      expect(result.data[0].name).toBe("main");
      expect(result.data[0].isDefault).toBe(true);
      expect(result.defaultBranch).toBe("main");
    });

    it("should return 500 when GitHub API fails", async () => {
      vi.mocked(queryOne).mockResolvedValueOnce(mockRepo);
      vi.mocked(getOctokitForRepo).mockRejectedValueOnce(new Error("API error"));

      const handler = getRoute("GET", "/:id/branches");
      const reply = createMockReply();
      await handler({ params: { id: "repo-1" } }, reply);

      expect(reply._statusCode).toBe(500);
    });
  });
});
