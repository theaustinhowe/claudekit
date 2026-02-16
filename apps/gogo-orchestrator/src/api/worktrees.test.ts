import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/index.js", () => ({
  getDb: vi.fn(async () => ({})),
}));

vi.mock("@devkit/duckdb", () => ({
  queryAll: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
  buildInClause: vi.fn((col: string, vals: string[]) => ({
    clause: `${col} IN (${vals.map(() => "?").join(",")})`,
    params: vals,
  })),
}));

vi.mock("../db/schema.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../db/schema.js")>();
  return {
    ...actual,
    mapJob: vi.fn((row: unknown) => row),
    mapRepositoryFull: vi.fn((row: unknown) => row),
  };
});

vi.mock("../ws/handler.js", () => ({
  broadcast: vi.fn(),
}));

vi.mock("../services/git.js", () => ({
  listWorktrees: vi.fn(),
  removeWorktree: vi.fn(),
  getChangedFiles: vi.fn(),
  getFileDiff: vi.fn(),
  getRepoDir: vi.fn((cfg: { workdir: string }) => cfg.workdir),
}));

vi.mock("../services/github/index.js", () => ({
  getOctokitForRepo: vi.fn(),
  getRepoConfigById: vi.fn(),
}));

vi.mock("../services/settings-helper.js", () => ({
  toGitConfigFromRepo: vi.fn((repo: unknown) => ({
    workdir: (repo as { workdirPath: string }).workdirPath,
    repoUrl: "https://github.com/org/repo.git",
    token: "test-token",
    owner: "org",
    name: "repo",
  })),
}));

vi.mock("node:fs/promises", () => ({
  rm: vi.fn(async () => {}),
  realpath: vi.fn(async (p: string) => p),
}));

import { execute, queryAll, queryOne } from "@devkit/duckdb";
import { mapJob, mapRepositoryFull } from "../db/schema.js";
import { getChangedFiles, getFileDiff, getRepoDir, listWorktrees, removeWorktree } from "../services/git.js";
import { getOctokitForRepo, getRepoConfigById } from "../services/github/index.js";
import { broadcast } from "../ws/handler.js";
import { worktreesRouter } from "./worktrees.js";

interface RouteHandler {
  method: string;
  path: string;
  handler: (request: unknown, reply: unknown) => Promise<unknown>;
}

function createMockFastify() {
  const routes: RouteHandler[] = [];
  const reg = (method: string) => (path: string, handler: (r: unknown, p: unknown) => Promise<unknown>) => {
    routes.push({ method, path, handler });
  };
  return {
    routes,
    instance: {
      get: reg("GET"),
      post: reg("POST"),
      log: { debug: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
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

const mockRepo = {
  id: "repo-1",
  owner: "org",
  name: "repo",
  displayName: "Test Repo",
  baseBranch: "main",
  workdirPath: "/tmp/workdir",
  isActive: true,
};

const mockJob = {
  id: "job-1",
  issueNumber: 42,
  issueTitle: "Test issue",
  status: "done",
  worktreePath: "/tmp/workdir/worktrees/issue-42",
  prNumber: 101,
  prUrl: "https://github.com/org/repo/pull/101",
  repositoryId: "repo-1",
  updatedAt: new Date("2024-01-01T00:00:00Z"),
};

describe("worktrees API", () => {
  let routes: RouteHandler[];
  let getRoute: (method: string, path: string) => (req: unknown, rep: unknown) => Promise<unknown>;

  beforeEach(async () => {
    vi.clearAllMocks();

    vi.mocked(mapJob).mockImplementation((row: unknown) => row as ReturnType<typeof mapJob>);
    vi.mocked(mapRepositoryFull).mockImplementation((row: unknown) => row as ReturnType<typeof mapRepositoryFull>);
    vi.mocked(execute).mockResolvedValue(undefined);

    const mock = createMockFastify();
    routes = mock.routes;
    await worktreesRouter(mock.instance as never, {} as never);

    getRoute = (method: string, path: string) => {
      const route = routes.find((r) => r.method === method && r.path === path);
      if (!route) throw new Error(`No route: ${method} ${path}`);
      return route.handler;
    };
  });

  describe("GET / (list worktrees)", () => {
    it("should return worktrees from all active repos", async () => {
      vi.mocked(queryAll)
        .mockResolvedValueOnce([mockRepo]) // active repos
        .mockResolvedValueOnce([mockJob]); // jobs with worktrees

      vi.mocked(listWorktrees).mockResolvedValueOnce([
        { path: "/tmp/workdir/worktrees/issue-42", branch: "agent/issue-42", commit: "abc123" },
      ]);

      const handler = getRoute("GET", "/");
      const result = (await handler({}, createMockReply())) as { data: unknown[] };

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toEqual(
        expect.objectContaining({
          path: "/tmp/workdir/worktrees/issue-42",
          branch: "agent/issue-42",
          commit: "abc123",
        }),
      );
    });

    it("should return empty when no active repos", async () => {
      vi.mocked(queryAll)
        .mockResolvedValueOnce([]) // no active repos
        .mockResolvedValueOnce([]); // no jobs

      const handler = getRoute("GET", "/");
      const result = (await handler({}, createMockReply())) as { data: unknown[] };

      expect(result.data).toHaveLength(0);
    });

    it("should handle listWorktrees errors gracefully", async () => {
      vi.mocked(queryAll).mockResolvedValueOnce([mockRepo]).mockResolvedValueOnce([]);

      vi.mocked(listWorktrees).mockRejectedValueOnce(new Error("No clone yet"));

      const handler = getRoute("GET", "/");
      const result = (await handler({}, createMockReply())) as { data: unknown[] };

      expect(result.data).toHaveLength(0);
    });

    it("should attach job info when worktree matches a job", async () => {
      vi.mocked(queryAll).mockResolvedValueOnce([mockRepo]).mockResolvedValueOnce([mockJob]);

      vi.mocked(listWorktrees).mockResolvedValueOnce([
        { path: mockJob.worktreePath, branch: "agent/issue-42", commit: "abc" },
      ]);

      const handler = getRoute("GET", "/");
      const result = (await handler({}, createMockReply())) as { data: Array<{ job: unknown }> };

      expect(result.data[0].job).toEqual(
        expect.objectContaining({
          id: "job-1",
          issueNumber: 42,
          status: "done",
        }),
      );
    });
  });

  describe("GET /:jobId/pr-status", () => {
    it("should return 404 when job not found", async () => {
      vi.mocked(queryOne).mockResolvedValueOnce(undefined);

      const handler = getRoute("GET", "/:jobId/pr-status");
      const reply = createMockReply();
      await handler({ params: { jobId: "nonexistent" } }, reply);

      expect(reply._statusCode).toBe(404);
    });

    it("should return not merged when job has no PR", async () => {
      vi.mocked(queryOne).mockResolvedValueOnce({ ...mockJob, prNumber: null, prUrl: null });

      const handler = getRoute("GET", "/:jobId/pr-status");
      const result = (await handler({ params: { jobId: "job-1" } }, createMockReply())) as { merged: boolean };

      expect(result.merged).toBe(false);
      expect(result).toEqual(expect.objectContaining({ prNumber: null, prUrl: null }));
    });

    it("should check GitHub API when job has PR and repositoryId", async () => {
      vi.mocked(queryOne).mockResolvedValueOnce(mockJob);
      vi.mocked(getOctokitForRepo).mockResolvedValueOnce({
        rest: { pulls: { get: vi.fn().mockResolvedValueOnce({ data: { merged: true } }) } },
      } as never);
      vi.mocked(getRepoConfigById).mockResolvedValueOnce({ owner: "org", name: "repo" } as never);

      const handler = getRoute("GET", "/:jobId/pr-status");
      const result = (await handler({ params: { jobId: "job-1" } }, createMockReply())) as { merged: boolean };

      expect(result.merged).toBe(true);
      expect(result.prNumber).toBe(101);
    });

    it("should return 500 when GitHub API fails", async () => {
      vi.mocked(queryOne).mockResolvedValueOnce(mockJob);
      vi.mocked(getOctokitForRepo).mockRejectedValueOnce(new Error("Rate limited"));
      vi.mocked(getRepoConfigById).mockResolvedValueOnce({ owner: "org", name: "repo" } as never);

      const handler = getRoute("GET", "/:jobId/pr-status");
      const reply = createMockReply();
      await handler({ params: { jobId: "job-1" } }, reply);

      expect(reply._statusCode).toBe(500);
    });

    it("should return not merged when job has no repositoryId", async () => {
      vi.mocked(queryOne).mockResolvedValueOnce({ ...mockJob, repositoryId: null });

      const handler = getRoute("GET", "/:jobId/pr-status");
      const result = (await handler({ params: { jobId: "job-1" } }, createMockReply())) as { merged: boolean };

      expect(result.merged).toBe(false);
      expect(result.prNumber).toBe(101);
    });
  });

  describe("GET /:jobId/changes", () => {
    it("should return 404 when job not found", async () => {
      vi.mocked(queryOne).mockResolvedValueOnce(undefined);

      const handler = getRoute("GET", "/:jobId/changes");
      const reply = createMockReply();
      await handler({ params: { jobId: "nonexistent" } }, reply);

      expect(reply._statusCode).toBe(404);
    });

    it("should return 400 when job has no worktree", async () => {
      vi.mocked(queryOne).mockResolvedValueOnce({ ...mockJob, worktreePath: null });

      const handler = getRoute("GET", "/:jobId/changes");
      const reply = createMockReply();
      await handler({ params: { jobId: "job-1" } }, reply);

      expect(reply._statusCode).toBe(400);
    });

    it("should return 400 when job has no repositoryId", async () => {
      vi.mocked(queryOne).mockResolvedValueOnce({ ...mockJob, repositoryId: null });

      const handler = getRoute("GET", "/:jobId/changes");
      const reply = createMockReply();
      await handler({ params: { jobId: "job-1" } }, reply);

      expect(reply._statusCode).toBe(400);
    });

    it("should return changed files for valid job", async () => {
      const changedFiles = [{ path: "src/index.ts", status: "modified" }];
      vi.mocked(queryOne)
        .mockResolvedValueOnce(mockJob) // job lookup
        .mockResolvedValueOnce(mockRepo); // repo lookup

      vi.mocked(getChangedFiles).mockResolvedValueOnce(changedFiles as never);

      const handler = getRoute("GET", "/:jobId/changes");
      const result = (await handler({ params: { jobId: "job-1" } }, createMockReply())) as {
        files: unknown[];
        baseBranch: string;
      };

      expect(result.files).toEqual(changedFiles);
      expect(result.baseBranch).toBe("main");
    });

    it("should return 400 when repo not found", async () => {
      vi.mocked(queryOne)
        .mockResolvedValueOnce(mockJob) // job
        .mockResolvedValueOnce(undefined); // repo missing

      const handler = getRoute("GET", "/:jobId/changes");
      const reply = createMockReply();
      await handler({ params: { jobId: "job-1" } }, reply);

      expect(reply._statusCode).toBe(400);
    });

    it("should return 500 when getChangedFiles fails", async () => {
      vi.mocked(queryOne).mockResolvedValueOnce(mockJob).mockResolvedValueOnce(mockRepo);
      vi.mocked(getChangedFiles).mockRejectedValueOnce(new Error("git error"));

      const handler = getRoute("GET", "/:jobId/changes");
      const reply = createMockReply();
      await handler({ params: { jobId: "job-1" } }, reply);

      expect(reply._statusCode).toBe(500);
    });
  });

  describe("GET /:jobId/diff", () => {
    it("should return 400 when no file path provided", async () => {
      const handler = getRoute("GET", "/:jobId/diff");
      const reply = createMockReply();
      await handler({ params: { jobId: "job-1" }, query: {} }, reply);

      expect(reply._statusCode).toBe(400);
      expect(reply._body).toEqual({ error: "File path is required" });
    });

    it("should return 404 when job not found", async () => {
      vi.mocked(queryOne).mockResolvedValueOnce(undefined);

      const handler = getRoute("GET", "/:jobId/diff");
      const reply = createMockReply();
      await handler({ params: { jobId: "nonexistent" }, query: { path: "src/index.ts" } }, reply);

      expect(reply._statusCode).toBe(404);
    });

    it("should return 400 when job has no worktree", async () => {
      vi.mocked(queryOne).mockResolvedValueOnce({ ...mockJob, worktreePath: null });

      const handler = getRoute("GET", "/:jobId/diff");
      const reply = createMockReply();
      await handler({ params: { jobId: "job-1" }, query: { path: "src/index.ts" } }, reply);

      expect(reply._statusCode).toBe(400);
    });

    it("should return diff for valid request", async () => {
      vi.mocked(queryOne).mockResolvedValueOnce(mockJob).mockResolvedValueOnce(mockRepo);
      vi.mocked(getFileDiff).mockResolvedValueOnce("--- a/src/index.ts\n+++ b/src/index.ts");

      const handler = getRoute("GET", "/:jobId/diff");
      const result = (await handler(
        { params: { jobId: "job-1" }, query: { path: "src/index.ts" } },
        createMockReply(),
      )) as { diff: string; filePath: string; baseBranch: string };

      expect(result.diff).toContain("index.ts");
      expect(result.filePath).toBe("src/index.ts");
      expect(result.baseBranch).toBe("main");
    });

    it("should return 400 when job has no repositoryId", async () => {
      vi.mocked(queryOne).mockResolvedValueOnce({ ...mockJob, repositoryId: null });

      const handler = getRoute("GET", "/:jobId/diff");
      const reply = createMockReply();
      await handler({ params: { jobId: "job-1" }, query: { path: "src/index.ts" } }, reply);

      expect(reply._statusCode).toBe(400);
    });

    it("should return 500 when getFileDiff fails", async () => {
      vi.mocked(queryOne).mockResolvedValueOnce(mockJob).mockResolvedValueOnce(mockRepo);
      vi.mocked(getFileDiff).mockRejectedValueOnce(new Error("git diff error"));

      const handler = getRoute("GET", "/:jobId/diff");
      const reply = createMockReply();
      await handler({ params: { jobId: "job-1" }, query: { path: "src/index.ts" } }, reply);

      expect(reply._statusCode).toBe(500);
    });
  });

  describe("GET /by-path/changes", () => {
    it("should return 400 when no worktreePath provided", async () => {
      const handler = getRoute("GET", "/by-path/changes");
      const reply = createMockReply();
      await handler({ query: {} }, reply);

      expect(reply._statusCode).toBe(400);
      expect(reply._body).toEqual({ error: "worktreePath is required" });
    });

    it("should return 400 when repo not found for path", async () => {
      vi.mocked(queryAll).mockResolvedValueOnce([]); // no active repos

      const handler = getRoute("GET", "/by-path/changes");
      const reply = createMockReply();
      await handler({ query: { worktreePath: "/some/path" } }, reply);

      expect(reply._statusCode).toBe(400);
    });

    it("should return changed files when repo matches path", async () => {
      vi.mocked(queryAll).mockResolvedValueOnce([mockRepo]);
      vi.mocked(getRepoDir).mockReturnValue("/tmp/workdir");
      vi.mocked(getChangedFiles).mockResolvedValueOnce([{ path: "file.ts", status: "modified" }] as never);

      const handler = getRoute("GET", "/by-path/changes");
      const result = (await handler(
        { query: { worktreePath: "/tmp/workdir/worktrees/issue-1" } },
        createMockReply(),
      )) as { files: unknown[] };

      expect(result.files).toHaveLength(1);
    });

    it("should return 500 when getChangedFiles fails", async () => {
      vi.mocked(queryAll).mockResolvedValueOnce([mockRepo]);
      vi.mocked(getRepoDir).mockReturnValue("/tmp/workdir");
      vi.mocked(getChangedFiles).mockRejectedValueOnce(new Error("git error"));

      const handler = getRoute("GET", "/by-path/changes");
      const reply = createMockReply();
      await handler({ query: { worktreePath: "/tmp/workdir/worktrees/issue-1" } }, reply);

      expect(reply._statusCode).toBe(500);
    });
  });

  describe("GET /by-path/diff", () => {
    it("should return 400 when no worktreePath provided", async () => {
      const handler = getRoute("GET", "/by-path/diff");
      const reply = createMockReply();
      await handler({ query: { path: "file.ts" } }, reply);

      expect(reply._statusCode).toBe(400);
      expect(reply._body).toEqual({ error: "worktreePath is required" });
    });

    it("should return 400 when no path provided", async () => {
      const handler = getRoute("GET", "/by-path/diff");
      const reply = createMockReply();
      await handler({ query: { worktreePath: "/tmp/workdir/wt" } }, reply);

      expect(reply._statusCode).toBe(400);
      expect(reply._body).toEqual({ error: "path is required" });
    });

    it("should return diff when repo matches", async () => {
      vi.mocked(queryAll).mockResolvedValueOnce([mockRepo]);
      vi.mocked(getRepoDir).mockReturnValue("/tmp/workdir");
      vi.mocked(getFileDiff).mockResolvedValueOnce("diff content");

      const handler = getRoute("GET", "/by-path/diff");
      const result = (await handler(
        { query: { worktreePath: "/tmp/workdir/worktrees/issue-1", path: "file.ts" } },
        createMockReply(),
      )) as { diff: string };

      expect(result.diff).toBe("diff content");
    });

    it("should return 400 when repo not found for path", async () => {
      vi.mocked(queryAll).mockResolvedValueOnce([]);

      const handler = getRoute("GET", "/by-path/diff");
      const reply = createMockReply();
      await handler({ query: { worktreePath: "/other/path", path: "file.ts" } }, reply);

      expect(reply._statusCode).toBe(400);
    });
  });

  describe("POST /:jobId/cleanup", () => {
    it("should return 404 when job not found", async () => {
      vi.mocked(queryOne).mockResolvedValueOnce(undefined);

      const handler = getRoute("POST", "/:jobId/cleanup");
      const reply = createMockReply();
      await handler({ params: { jobId: "nonexistent" } }, reply);

      expect(reply._statusCode).toBe(404);
    });

    it("should return 400 when job status is not done/failed", async () => {
      vi.mocked(queryOne).mockResolvedValueOnce({ ...mockJob, status: "running" });

      const handler = getRoute("POST", "/:jobId/cleanup");
      const reply = createMockReply();
      await handler({ params: { jobId: "job-1" } }, reply);

      expect(reply._statusCode).toBe(400);
      expect(reply._body).toEqual(expect.objectContaining({ error: "Cannot cleanup job" }));
    });

    it("should return 400 when PR is not merged", async () => {
      vi.mocked(queryOne).mockResolvedValueOnce(mockJob);
      vi.mocked(getOctokitForRepo).mockResolvedValueOnce({
        rest: { pulls: { get: vi.fn().mockResolvedValueOnce({ data: { merged: false } }) } },
      } as never);
      vi.mocked(getRepoConfigById).mockResolvedValueOnce({ owner: "org", name: "repo" } as never);

      const handler = getRoute("POST", "/:jobId/cleanup");
      const reply = createMockReply();
      await handler({ params: { jobId: "job-1" } }, reply);

      expect(reply._statusCode).toBe(400);
      expect(reply._body).toEqual(
        expect.objectContaining({ details: "PR exists but is not merged. Merge or close the PR first." }),
      );
    });

    it("should cleanup worktree successfully when PR is merged", async () => {
      vi.mocked(queryOne)
        .mockResolvedValueOnce(mockJob) // job lookup
        .mockResolvedValueOnce(mockRepo) // repo lookup
        .mockResolvedValueOnce({ ...mockJob, worktreePath: null }); // update result

      vi.mocked(getOctokitForRepo).mockResolvedValueOnce({
        rest: { pulls: { get: vi.fn().mockResolvedValueOnce({ data: { merged: true } }) } },
      } as never);
      vi.mocked(getRepoConfigById).mockResolvedValueOnce({ owner: "org", name: "repo" } as never);
      vi.mocked(getRepoDir).mockReturnValue("/tmp/workdir");
      vi.mocked(removeWorktree).mockResolvedValueOnce(undefined);

      const handler = getRoute("POST", "/:jobId/cleanup");
      const result = (await handler({ params: { jobId: "job-1" } }, createMockReply())) as { success: boolean };

      expect(result.success).toBe(true);
      expect(removeWorktree).toHaveBeenCalled();
      expect(broadcast).toHaveBeenCalledWith(expect.objectContaining({ type: "job:updated" }));
    });

    it("should return 400 when job has no worktree path", async () => {
      vi.mocked(queryOne).mockResolvedValueOnce({
        ...mockJob,
        prNumber: null,
        worktreePath: null,
      });

      const handler = getRoute("POST", "/:jobId/cleanup");
      const reply = createMockReply();
      await handler({ params: { jobId: "job-1" } }, reply);

      expect(reply._statusCode).toBe(400);
    });

    it("should return 400 when job has no repositoryId", async () => {
      vi.mocked(queryOne).mockResolvedValueOnce({
        ...mockJob,
        prNumber: null,
        repositoryId: null,
      });

      const handler = getRoute("POST", "/:jobId/cleanup");
      const reply = createMockReply();
      await handler({ params: { jobId: "job-1" } }, reply);

      expect(reply._statusCode).toBe(400);
    });

    it("should return 400 when worktree path is outside repo dir", async () => {
      vi.mocked(queryOne)
        .mockResolvedValueOnce({
          ...mockJob,
          prNumber: null,
          worktreePath: "/etc/passwd",
        })
        .mockResolvedValueOnce(mockRepo);

      vi.mocked(getRepoDir).mockReturnValue("/tmp/workdir");

      const handler = getRoute("POST", "/:jobId/cleanup");
      const reply = createMockReply();
      await handler({ params: { jobId: "job-1" } }, reply);

      expect(reply._statusCode).toBe(400);
      expect(reply._body).toEqual(expect.objectContaining({ error: "Invalid worktree path" }));
    });

    it("should return 500 when removeWorktree fails", async () => {
      vi.mocked(queryOne)
        .mockResolvedValueOnce({ ...mockJob, prNumber: null })
        .mockResolvedValueOnce(mockRepo);

      vi.mocked(getRepoDir).mockReturnValue("/tmp/workdir");
      vi.mocked(removeWorktree).mockRejectedValueOnce(new Error("git error"));

      const handler = getRoute("POST", "/:jobId/cleanup");
      const reply = createMockReply();
      await handler({ params: { jobId: "job-1" } }, reply);

      expect(reply._statusCode).toBe(500);
    });
  });

  describe("POST /cleanup (bulk)", () => {
    it("should return 400 when no valid statuses provided", async () => {
      const handler = getRoute("POST", "/cleanup");
      const reply = createMockReply();
      await handler({ body: { includeStatuses: ["running", "paused"] } }, reply);

      expect(reply._statusCode).toBe(400);
    });

    it("should return cleaned jobs in dry run mode", async () => {
      vi.mocked(queryAll)
        .mockResolvedValueOnce([mockJob]) // jobs to clean
        .mockResolvedValueOnce([mockRepo]); // repo configs

      vi.mocked(getRepoDir).mockReturnValue("/tmp/workdir");

      const handler = getRoute("POST", "/cleanup");
      const result = (await handler({ body: { dryRun: true } }, createMockReply())) as {
        data: { cleaned: unknown[] };
        dryRun: boolean;
      };

      expect(result.dryRun).toBe(true);
      expect(result.data.cleaned).toHaveLength(1);
    });

    it("should cleanup worktrees and update jobs", async () => {
      vi.mocked(queryAll).mockResolvedValueOnce([mockJob]).mockResolvedValueOnce([mockRepo]);

      vi.mocked(queryOne).mockResolvedValueOnce({ ...mockJob, worktreePath: null }); // updated job
      vi.mocked(getRepoDir).mockReturnValue("/tmp/workdir");
      vi.mocked(removeWorktree).mockResolvedValueOnce(undefined);

      const handler = getRoute("POST", "/cleanup");
      const result = (await handler({ body: {} }, createMockReply())) as {
        data: { cleaned: unknown[]; errors: unknown[] };
      };

      expect(result.data.cleaned).toHaveLength(1);
      expect(result.data.errors).toHaveLength(0);
      expect(removeWorktree).toHaveBeenCalled();
      expect(broadcast).toHaveBeenCalled();
    });

    it("should skip jobs without worktree paths", async () => {
      vi.mocked(queryAll).mockResolvedValueOnce([{ ...mockJob, worktreePath: null }]);

      const handler = getRoute("POST", "/cleanup");
      const result = (await handler({ body: {} }, createMockReply())) as {
        data: { cleaned: unknown[]; skipped: unknown[] };
      };

      expect(result.data.cleaned).toHaveLength(0);
    });

    it("should skip jobs without repository config", async () => {
      vi.mocked(queryAll).mockResolvedValueOnce([{ ...mockJob, repositoryId: null }]);

      const handler = getRoute("POST", "/cleanup");
      const result = (await handler({ body: {} }, createMockReply())) as {
        data: { skipped: Array<{ reason: string }> };
      };

      expect(result.data.skipped).toHaveLength(1);
    });

    it("should handle removeWorktree errors", async () => {
      vi.mocked(queryAll).mockResolvedValueOnce([mockJob]).mockResolvedValueOnce([mockRepo]);

      vi.mocked(getRepoDir).mockReturnValue("/tmp/workdir");
      vi.mocked(removeWorktree).mockRejectedValueOnce(new Error("git error"));

      const handler = getRoute("POST", "/cleanup");
      const result = (await handler({ body: {} }, createMockReply())) as {
        data: { errors: Array<{ error: string }> };
      };

      expect(result.data.errors).toHaveLength(1);
      expect(result.data.errors[0].error).toBe("git error");
    });

    it("should filter by specific jobIds when provided", async () => {
      vi.mocked(queryAll)
        .mockResolvedValueOnce([mockJob, { ...mockJob, id: "job-2", worktreePath: "/tmp/workdir/wt2" }])
        .mockResolvedValueOnce([mockRepo]);

      vi.mocked(getRepoDir).mockReturnValue("/tmp/workdir");

      const handler = getRoute("POST", "/cleanup");
      const result = (await handler({ body: { dryRun: true, jobIds: ["job-1"] } }, createMockReply())) as {
        data: { cleaned: Array<{ jobId: string }> };
      };

      expect(result.data.cleaned).toHaveLength(1);
      expect(result.data.cleaned[0].jobId).toBe("job-1");
    });

    it("should default to body={} when body is null", async () => {
      vi.mocked(queryAll).mockResolvedValueOnce([]);

      const handler = getRoute("POST", "/cleanup");
      const result = (await handler({ body: null }, createMockReply())) as { dryRun: boolean };

      expect(result.dryRun).toBe(false);
    });
  });
});
