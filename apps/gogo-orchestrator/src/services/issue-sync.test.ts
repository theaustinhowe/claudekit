import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@devkit/duckdb", () => ({
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

import { execute, queryAll, queryOne } from "@devkit/duckdb";
import { getIssueCommentsForRepo, getIssuesForRepo } from "./github/index.js";
import { syncIssuesForRepo } from "./issue-sync.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("issue-sync", () => {
  describe("syncIssuesForRepo", () => {
    it("syncs issues from GitHub to local DB", async () => {
      // queryOne: 1) repo lookup, 2) upsertIssue existing check
      vi.mocked(queryOne)
        .mockResolvedValueOnce({ id: "repo-1", last_issue_sync_at: null }) // repo lookup
        .mockResolvedValueOnce(undefined); // upsertIssue - not existing

      // queryAll: detectIssueEditForJob looks for active jobs
      vi.mocked(queryAll).mockResolvedValue([] as never);

      vi.mocked(getIssuesForRepo).mockResolvedValue([
        {
          number: 1,
          title: "Bug fix",
          body: "Fix the thing",
          state: "open",
          user: { login: "user1" },
          labels: [{ name: "bug" }],
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
      ] as never);

      vi.mocked(getIssueCommentsForRepo).mockResolvedValue([] as never);
      vi.mocked(execute).mockResolvedValue(undefined as never);

      const result = await syncIssuesForRepo("repo-1");

      expect(result.synced).toBe(1);
      expect(result.comments).toBe(0);
      expect(getIssuesForRepo).toHaveBeenCalledWith("repo-1", expect.any(Object));
    });

    it("returns zeros when repo not found", async () => {
      vi.mocked(queryOne).mockResolvedValueOnce(undefined);

      const result = await syncIssuesForRepo("nonexistent");

      expect(result).toEqual({ synced: 0, comments: 0 });
      expect(getIssuesForRepo).not.toHaveBeenCalled();
    });
  });
});
