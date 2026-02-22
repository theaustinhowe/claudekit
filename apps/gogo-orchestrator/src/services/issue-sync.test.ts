import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@claudekit/duckdb", () => ({
  queryAll: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
}));
vi.mock("../db/index.js", () => ({
  getDb: vi.fn(async () => ({})),
}));
vi.mock("./github/index.js", () => ({
  getIssuesForRepo: vi.fn(),
  getIssueCommentsForRepo: vi.fn(),
}));
vi.mock("../ws/handler.js", () => ({
  broadcast: vi.fn(),
}));
vi.mock("../utils/logger.js", () => ({
  createServiceLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { execute, queryAll, queryOne } from "@claudekit/duckdb";
import { broadcast } from "../ws/handler.js";
import { getIssueCommentsForRepo, getIssuesForRepo } from "./github/index.js";
import { syncAllIssues, syncCommentsForIssue, syncIssuesForRepo } from "./issue-sync.js";

beforeEach(() => {
  vi.clearAllMocks();
});

const makeGhIssue = (overrides = {}) => ({
  number: 1,
  title: "Bug fix",
  body: "Fix the thing",
  state: "open",
  html_url: "https://github.com/org/repo/issues/1",
  user: { login: "user1", avatar_url: "https://avatar.com/u1", html_url: "https://github.com/user1" },
  labels: [{ name: "bug" }],
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
  closed_at: null,
  ...overrides,
});

const makeGhComment = (overrides = {}) => ({
  id: 100,
  body: "A comment",
  html_url: "https://github.com/org/repo/issues/1#comment-100",
  user: { login: "user1", type: "User", avatar_url: "https://avatar.com/u1" },
  created_at: "2024-01-02T00:00:00Z",
  updated_at: "2024-01-02T00:00:00Z",
  ...overrides,
});

describe("issue-sync", () => {
  describe("syncIssuesForRepo", () => {
    it("syncs issues from GitHub to local DB (insert path)", async () => {
      vi.mocked(queryOne)
        .mockResolvedValueOnce({ id: "repo-1", last_issue_sync_at: null }) // repo lookup
        .mockResolvedValueOnce(undefined); // upsertIssue - not existing (insert)

      vi.mocked(queryAll).mockResolvedValue([] as never); // detectIssueEditForJob
      vi.mocked(getIssuesForRepo).mockResolvedValue([makeGhIssue()] as never);
      vi.mocked(getIssueCommentsForRepo).mockResolvedValue([] as never);
      vi.mocked(execute).mockResolvedValue(undefined as never);

      const result = await syncIssuesForRepo("repo-1");

      expect(result.synced).toBe(1);
      expect(result.comments).toBe(0);
      expect(getIssuesForRepo).toHaveBeenCalledWith("repo-1", expect.objectContaining({ state: "open" }));
      // Should have called execute for INSERT (issue) + UPDATE (last_issue_sync_at)
      expect(execute).toHaveBeenCalled();
    });

    it("uses incremental sync when lastIssueSyncAt exists", async () => {
      vi.mocked(queryOne)
        .mockResolvedValueOnce({ id: "repo-1", last_issue_sync_at: "2024-01-01T00:00:00Z" })
        .mockResolvedValueOnce(undefined);

      vi.mocked(queryAll).mockResolvedValue([] as never);
      vi.mocked(getIssuesForRepo).mockResolvedValue([makeGhIssue()] as never);
      vi.mocked(getIssueCommentsForRepo).mockResolvedValue([] as never);
      vi.mocked(execute).mockResolvedValue(undefined as never);

      await syncIssuesForRepo("repo-1");

      // Should use state: "all" when doing incremental sync
      expect(getIssuesForRepo).toHaveBeenCalledWith(
        "repo-1",
        expect.objectContaining({ state: "all", since: "2024-01-01T00:00:00Z" }),
      );
    });

    it("updates existing issues (update path)", async () => {
      vi.mocked(queryOne)
        .mockResolvedValueOnce({ id: "repo-1", last_issue_sync_at: null })
        .mockResolvedValueOnce({ id: "existing-issue-id" }); // upsertIssue - existing

      vi.mocked(queryAll).mockResolvedValue([] as never);
      vi.mocked(getIssuesForRepo).mockResolvedValue([makeGhIssue()] as never);
      vi.mocked(getIssueCommentsForRepo).mockResolvedValue([] as never);
      vi.mocked(execute).mockResolvedValue(undefined as never);

      const result = await syncIssuesForRepo("repo-1");

      expect(result.synced).toBe(1);
      // The first execute call should be an UPDATE (not INSERT)
      expect(execute).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining("UPDATE issues"),
        expect.any(Array),
      );
    });

    it("syncs comments for each issue", async () => {
      vi.mocked(queryOne)
        .mockResolvedValueOnce({ id: "repo-1", last_issue_sync_at: null })
        .mockResolvedValueOnce(undefined) // issue doesn't exist
        .mockResolvedValueOnce(undefined); // comment doesn't exist

      vi.mocked(queryAll).mockResolvedValue([] as never);
      vi.mocked(getIssuesForRepo).mockResolvedValue([makeGhIssue()] as never);
      vi.mocked(getIssueCommentsForRepo).mockResolvedValue([makeGhComment()] as never);
      vi.mocked(execute).mockResolvedValue(undefined as never);

      const result = await syncIssuesForRepo("repo-1");

      expect(result.synced).toBe(1);
      expect(result.comments).toBe(1);
    });

    it("returns zeros when repo not found", async () => {
      vi.mocked(queryOne).mockResolvedValueOnce(undefined);

      const result = await syncIssuesForRepo("nonexistent");

      expect(result).toEqual({ synced: 0, comments: 0 });
      expect(getIssuesForRepo).not.toHaveBeenCalled();
    });

    it("detects issue edits for active jobs", async () => {
      const activeJob = {
        id: "job-1",
        created_at: "2024-01-01T00:00:00Z",
        issue_body: "Old body",
      };

      // Call order: 1) repo lookup, 2) job status check (detectIssueEditForJob), 3) upsertIssue existing check
      vi.mocked(queryOne)
        .mockResolvedValueOnce({ id: "repo-1", last_issue_sync_at: null }) // repo lookup
        .mockResolvedValueOnce({ status: "running" }) // job status check
        .mockResolvedValueOnce(undefined); // upsertIssue

      vi.mocked(queryAll).mockResolvedValueOnce([activeJob]); // detectIssueEditForJob

      vi.mocked(getIssuesForRepo).mockResolvedValue([
        makeGhIssue({
          body: "New edited body",
          updated_at: "2024-01-02T00:00:00Z", // after job created
        }),
      ] as never);
      vi.mocked(getIssueCommentsForRepo).mockResolvedValue([] as never);
      vi.mocked(execute).mockResolvedValue(undefined as never);

      await syncIssuesForRepo("repo-1");

      // Should have broadcast issue edit notification
      expect(broadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "job:updated",
          payload: expect.objectContaining({ issueEdited: true }),
        }),
      );
    });

    it("skips edit detection for done/failed jobs", async () => {
      // Call order: 1) repo lookup, 2) job status check, 3) upsertIssue
      vi.mocked(queryOne)
        .mockResolvedValueOnce({ id: "repo-1", last_issue_sync_at: null })
        .mockResolvedValueOnce({ status: "done" }) // terminal
        .mockResolvedValueOnce(undefined); // upsertIssue

      vi.mocked(queryAll).mockResolvedValueOnce([
        { id: "job-1", created_at: "2024-01-01T00:00:00Z", issue_body: "Old body" },
      ]);

      vi.mocked(getIssuesForRepo).mockResolvedValue([
        makeGhIssue({ body: "New body", updated_at: "2024-01-02T00:00:00Z" }),
      ] as never);
      vi.mocked(getIssueCommentsForRepo).mockResolvedValue([] as never);
      vi.mocked(execute).mockResolvedValue(undefined as never);

      await syncIssuesForRepo("repo-1");

      // Should NOT broadcast edit notification for done jobs
      expect(broadcast).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: "job:updated", payload: expect.objectContaining({ issueEdited: true }) }),
      );
    });
  });

  describe("syncCommentsForIssue", () => {
    it("syncs comments and returns count", async () => {
      vi.mocked(getIssueCommentsForRepo).mockResolvedValue([makeGhComment(), makeGhComment({ id: 101 })] as never);
      vi.mocked(queryOne).mockResolvedValue(undefined); // comments don't exist
      vi.mocked(execute).mockResolvedValue(undefined as never);

      const count = await syncCommentsForIssue("repo-1", 42);

      expect(count).toBe(2);
      expect(getIssueCommentsForRepo).toHaveBeenCalledWith("repo-1", 42);
    });

    it("returns 0 when no comments", async () => {
      vi.mocked(getIssueCommentsForRepo).mockResolvedValue([] as never);

      const count = await syncCommentsForIssue("repo-1", 42);

      expect(count).toBe(0);
    });

    it("updates existing comments", async () => {
      vi.mocked(getIssueCommentsForRepo).mockResolvedValue([makeGhComment()] as never);
      vi.mocked(queryOne).mockResolvedValueOnce({ id: "existing-comment-id" }); // exists
      vi.mocked(execute).mockResolvedValue(undefined as never);

      const count = await syncCommentsForIssue("repo-1", 42);

      expect(count).toBe(1);
      expect(execute).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining("UPDATE issue_comments"),
        expect.any(Array),
      );
    });
  });

  describe("syncAllIssues", () => {
    it("syncs all active repos and broadcasts summary", async () => {
      vi.mocked(queryAll).mockResolvedValueOnce([{ id: "repo-1", is_active: true, owner: "org", name: "repo" }]);

      // Mock the syncIssuesForRepo internals
      vi.mocked(queryOne)
        .mockResolvedValueOnce({ id: "repo-1", last_issue_sync_at: null })
        .mockResolvedValueOnce(undefined);
      vi.mocked(queryAll).mockResolvedValue([] as never);
      vi.mocked(getIssuesForRepo).mockResolvedValue([makeGhIssue()] as never);
      vi.mocked(getIssueCommentsForRepo).mockResolvedValue([makeGhComment()] as never);
      vi.mocked(queryOne).mockResolvedValueOnce(undefined); // comment upsert
      vi.mocked(execute).mockResolvedValue(undefined as never);

      await syncAllIssues();

      expect(broadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "issue:synced",
          payload: expect.objectContaining({ issues: 1, comments: 1 }),
        }),
      );
    });

    it("does not broadcast when nothing synced", async () => {
      vi.mocked(queryAll).mockResolvedValueOnce([]); // no active repos

      await syncAllIssues();

      expect(broadcast).not.toHaveBeenCalled();
    });

    it("continues syncing other repos when one fails", async () => {
      vi.mocked(queryAll).mockResolvedValueOnce([
        { id: "repo-1", is_active: true, owner: "org1", name: "repo1" },
        { id: "repo-2", is_active: true, owner: "org2", name: "repo2" },
      ]);

      // repo-1: fails
      vi.mocked(queryOne).mockResolvedValueOnce(undefined); // not found -> returns {0,0}

      // repo-2: succeeds
      vi.mocked(queryOne)
        .mockResolvedValueOnce({ id: "repo-2", last_issue_sync_at: null })
        .mockResolvedValueOnce(undefined);
      vi.mocked(queryAll).mockResolvedValue([] as never);
      vi.mocked(getIssuesForRepo).mockResolvedValue([makeGhIssue()] as never);
      vi.mocked(getIssueCommentsForRepo).mockResolvedValue([] as never);
      vi.mocked(execute).mockResolvedValue(undefined as never);

      await syncAllIssues();

      // Should still broadcast for repo-2's synced issue
      expect(broadcast).toHaveBeenCalled();
    });
  });
});
