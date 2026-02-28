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
    mapIssue: vi.fn((row: unknown) => row),
    mapIssueComment: vi.fn((row: unknown) => row),
    mapJob: vi.fn((row: unknown) => row),
    mapRepositoryFull: vi.fn((row: unknown) => row),
  };
});

vi.mock("../ws/handler.js", () => ({
  broadcast: vi.fn(),
}));

vi.mock("../services/github/index.js", () => ({
  createIssueCommentForRepo: vi.fn(),
  createIssueForRepo: vi.fn(),
  getIssueByNumber: vi.fn(),
}));

vi.mock("../services/issue-sync.js", () => ({
  syncIssuesForRepo: vi.fn(),
  syncCommentsForIssue: vi.fn(),
}));

import { execute, queryAll, queryOne } from "@claudekit/duckdb";
import { mapIssue, mapRepositoryFull } from "../db/schema.js";
import { syncIssuesForRepo } from "../services/issue-sync.js";
import { createMockFastify, createMockReply, type RouteHandler } from "../test-utils.js";
import { broadcast } from "../ws/handler.js";
import { issuesRouter } from "./issues.js";

describe("issues API", () => {
  let routes: RouteHandler[];

  beforeEach(async () => {
    vi.clearAllMocks();

    vi.mocked(mapIssue).mockImplementation((row: unknown) => row as ReturnType<typeof mapIssue>);
    vi.mocked(mapRepositoryFull).mockImplementation((row: unknown) => row as ReturnType<typeof mapRepositoryFull>);
    vi.mocked(execute).mockResolvedValue(undefined);

    const mock = createMockFastify();
    routes = mock.routes;
    await issuesRouter(mock.instance as never, {} as never);
  });

  describe("GET /:id/issues (list issues)", () => {
    it("should return 404 when repository not found", async () => {
      vi.mocked(queryOne).mockResolvedValue(undefined);

      const handler = routes.find((r) => r.method === "GET" && r.path === "/:id/issues")?.handler;
      const reply = createMockReply();
      await handler?.({ params: { id: "nonexistent" }, query: {} }, reply);

      expect(reply._statusCode).toBe(404);
      expect(reply._body).toEqual({ error: "Repository not found" });
    });

    it("should return issues with pagination", async () => {
      const repo = { id: "repo-1", lastIssueSyncAt: new Date() };
      const issues = [
        {
          number: 1,
          title: "Bug",
          body: "desc",
          htmlUrl: "https://github.com/t/r/issues/1",
          state: "open",
          labels: [],
          authorLogin: "user1",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      vi.mocked(queryOne)
        .mockResolvedValueOnce(repo) // repository lookup
        .mockResolvedValueOnce(undefined); // jobExistsForIssue - no job

      vi.mocked(queryAll).mockResolvedValue(issues);
      vi.mocked(mapIssue).mockImplementation((row: unknown) => row as ReturnType<typeof mapIssue>);

      const handler = routes.find((r) => r.method === "GET" && r.path === "/:id/issues")?.handler;
      const result = (await handler?.(
        { params: { id: "repo-1" }, query: { state: "open", per_page: "30", page: "1" } },
        createMockReply(),
      )) as { data: unknown[]; pagination: { page: number; per_page: number } };

      expect(result.data).toBeDefined();
      expect(result.pagination).toEqual({ page: 1, per_page: 30 });
    });

    it("should trigger initial sync when repo has never been synced", async () => {
      const repo = { id: "repo-1", lastIssueSyncAt: null };

      vi.mocked(queryOne).mockResolvedValue(repo);
      vi.mocked(queryAll).mockResolvedValue([]);
      vi.mocked(syncIssuesForRepo).mockResolvedValue({ synced: 0, comments: 0 });

      const handler = routes.find((r) => r.method === "GET" && r.path === "/:id/issues")?.handler;
      await handler?.({ params: { id: "repo-1" }, query: {} }, createMockReply());

      expect(syncIssuesForRepo).toHaveBeenCalledWith("repo-1");
    });
  });

  describe("POST /:id/issues/:issueNumber/job (create job from issue)", () => {
    it("should return 400 for invalid issue number", async () => {
      const handler = routes.find((r) => r.method === "POST" && r.path === "/:id/issues/:issueNumber/job")?.handler;
      const reply = createMockReply();
      await handler?.({ params: { id: "repo-1", issueNumber: "abc" } }, reply);

      expect(reply._statusCode).toBe(400);
      expect(reply._body).toEqual({ error: "Invalid issue number" });
    });

    it("should return 404 when repository not found", async () => {
      vi.mocked(queryOne).mockResolvedValue(undefined);

      const handler = routes.find((r) => r.method === "POST" && r.path === "/:id/issues/:issueNumber/job")?.handler;
      const reply = createMockReply();
      await handler?.({ params: { id: "nonexistent", issueNumber: "1" } }, reply);

      expect(reply._statusCode).toBe(404);
    });

    it("should return 409 when job already exists", async () => {
      vi.mocked(queryOne)
        .mockResolvedValueOnce({ id: "repo-1" }) // repo exists
        .mockResolvedValueOnce({ id: "existing-job" }); // job exists

      const handler = routes.find((r) => r.method === "POST" && r.path === "/:id/issues/:issueNumber/job")?.handler;
      const reply = createMockReply();
      await handler?.({ params: { id: "repo-1", issueNumber: "42" } }, reply);

      expect(reply._statusCode).toBe(409);
      expect(reply._body).toEqual(expect.objectContaining({ error: "Job already exists for this issue" }));
    });

    it("should create job successfully from local DB issue", async () => {
      const localIssue = {
        id: "issue-42",
        repositoryId: "repo-1",
        number: 42,
        title: "Fix bug",
        body: "Bug description",
        htmlUrl: "https://github.com/t/r/issues/42",
        state: "open",
        labels: [],
        authorLogin: "user",
        authorAvatarUrl: null,
        authorHtmlUrl: null,
        githubCreatedAt: null,
        githubUpdatedAt: null,
        closedAt: null,
        lastSyncedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const newJob = { id: "new-job", status: "queued", issueNumber: 42 };

      vi.mocked(queryOne)
        .mockResolvedValueOnce({ id: "repo-1" }) // repo exists
        .mockResolvedValueOnce(undefined) // no existing job
        .mockResolvedValueOnce(localIssue) // local issue found
        .mockResolvedValueOnce(newJob); // createJobFromIssue

      vi.mocked(mapIssue).mockReturnValue(localIssue as ReturnType<typeof mapIssue>);

      const handler = routes.find((r) => r.method === "POST" && r.path === "/:id/issues/:issueNumber/job")?.handler;
      const result = await handler?.({ params: { id: "repo-1", issueNumber: "42" } }, createMockReply());

      expect(result).toEqual(expect.objectContaining({ success: true, jobId: "new-job" }));
    });
  });

  describe("POST /:id/issues/sync (manual sync)", () => {
    it("should return 404 when repository not found", async () => {
      vi.mocked(queryOne).mockResolvedValue(undefined);

      const handler = routes.find((r) => r.method === "POST" && r.path === "/:id/issues/sync")?.handler;
      const reply = createMockReply();
      await handler?.({ params: { id: "nonexistent" } }, reply);

      expect(reply._statusCode).toBe(404);
    });

    it("should sync and broadcast results", async () => {
      vi.mocked(queryOne).mockResolvedValue({ id: "repo-1" });
      vi.mocked(syncIssuesForRepo).mockResolvedValue({ synced: 10, comments: 25 });

      const handler = routes.find((r) => r.method === "POST" && r.path === "/:id/issues/sync")?.handler;
      const result = await handler?.({ params: { id: "repo-1" } }, createMockReply());

      expect(result).toEqual(expect.objectContaining({ success: true, synced: 10, comments: 25 }));
      expect(broadcast).toHaveBeenCalledWith({
        type: "issue:synced",
        payload: { repositoryId: "repo-1", issues: 10, comments: 25 },
      });
    });

    it("should return 500 on sync failure", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      vi.mocked(queryOne).mockResolvedValue({ id: "repo-1" });
      vi.mocked(syncIssuesForRepo).mockRejectedValue(new Error("API limit reached"));

      const handler = routes.find((r) => r.method === "POST" && r.path === "/:id/issues/sync")?.handler;
      const reply = createMockReply();
      await handler?.({ params: { id: "repo-1" } }, reply);

      expect(reply._statusCode).toBe(500);
    });
  });
});
