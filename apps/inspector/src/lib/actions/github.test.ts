import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
  execute: vi.fn(),
  queryAll: vi.fn(),
  queryOne: vi.fn(),
}));

vi.mock("@/lib/github", () => ({
  getOctokit: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  createServiceLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock("@/lib/actions/settings", () => ({
  getSetting: vi.fn().mockResolvedValue(null),
}));

import { execute, getDb, queryAll, queryOne } from "@/lib/db";
import { getOctokit } from "@/lib/github";
import { getConnectedRepos, removeRepo, syncPRComments, syncPRs, syncRepo } from "./github";

const mockGetDb = vi.mocked(getDb);
const mockExecute = vi.mocked(execute);
const mockQueryAll = vi.mocked(queryAll);
const mockQueryOne = vi.mocked(queryOne);
const mockGetOctokit = vi.mocked(getOctokit);

function createMockOctokit(overrides: Record<string, unknown> = {}) {
  return {
    paginate: vi.fn().mockResolvedValue([]),
    rest: {
      repos: {
        get: vi.fn().mockResolvedValue({
          data: { full_name: "owner/repo", default_branch: "main" },
        }),
        getContent: vi.fn(),
      },
      pulls: {
        list: vi.fn().mockResolvedValue({ data: [] }),
        listReviews: vi.fn().mockResolvedValue({ data: [] }),
        listReviewComments: vi.fn().mockResolvedValue({ data: [] }),
        get: vi.fn(),
      },
      ...overrides,
    },
  } as unknown as ReturnType<typeof getOctokit>;
}

describe("github actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDb.mockResolvedValue({} as Awaited<ReturnType<typeof getDb>>);
  });

  describe("syncRepo", () => {
    it("inserts repo and returns metadata", async () => {
      const octokit = createMockOctokit();
      mockGetOctokit.mockReturnValue(octokit);

      const result = await syncRepo("owner", "repo");

      expect(result).toEqual({
        id: "owner/repo",
        fullName: "owner/repo",
        defaultBranch: "main",
      });
      expect(mockExecute).toHaveBeenCalledWith(
        {},
        expect.stringContaining("INSERT INTO repos"),
        expect.arrayContaining(["owner/repo", "owner", "repo"]),
      );
    });
  });

  describe("syncPRs", () => {
    it("syncs PRs and returns count", async () => {
      mockQueryOne.mockResolvedValue({ owner: "owner", name: "repo", last_synced_at: null });
      const octokit = createMockOctokit();
      (octokit.paginate as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          number: 1,
          title: "Fix bug",
          state: "open",
          user: { login: "alice", avatar_url: "https://avatar.url" },
          head: { ref: "fix-branch" },
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-02T00:00:00Z",
          additions: 10,
          deletions: 5,
          changed_files: 3,
          draft: false,
          merged_at: null,
        },
      ]);
      mockGetOctokit.mockReturnValue(octokit);

      const count = await syncPRs("owner/repo");

      expect(count).toBe(1);
      // 1 PR insert + 1 last_synced_at update
      expect(mockExecute).toHaveBeenCalledTimes(2);
      expect(mockExecute).toHaveBeenCalledWith(
        {},
        expect.stringContaining("INSERT INTO prs"),
        expect.arrayContaining(["owner/repo#1", "owner/repo", 1, "Fix bug"]),
      );
    });

    it("classifies merged PRs correctly", async () => {
      mockQueryOne.mockResolvedValue({ owner: "owner", name: "repo", last_synced_at: null });
      const octokit = createMockOctokit();
      (octokit.paginate as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          number: 2,
          title: "Merged PR",
          state: "closed",
          user: { login: "bob", avatar_url: null },
          head: { ref: "feat" },
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-02T00:00:00Z",
          merged_at: "2024-01-02T00:00:00Z",
          draft: false,
          additions: 50,
          deletions: 20,
          changed_files: 5,
        },
      ]);
      mockGetOctokit.mockReturnValue(octokit);

      await syncPRs("owner/repo");

      // Check that review_status is "Merged" (11th arg in the params array)
      const insertCall = mockExecute.mock.calls.find((c) => (c[1] as string).includes("INSERT INTO prs"));
      expect(insertCall).toBeDefined();
      const params = insertCall?.[2] as unknown[];
      expect(params[11]).toBe("Merged");
    });

    it("throws when repo not found", async () => {
      mockQueryOne.mockResolvedValue(undefined);
      mockGetOctokit.mockReturnValue(createMockOctokit());

      await expect(syncPRs("nonexistent")).rejects.toThrow("Repo not found");
    });
  });

  describe("syncPRComments", () => {
    it("syncs comments and returns count", async () => {
      mockQueryOne.mockResolvedValue({ owner: "owner", name: "repo" });
      const octokit = createMockOctokit();
      (octokit.paginate as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: 100,
          user: { login: "reviewer1", avatar_url: null },
          body: "Needs fix",
          path: "src/app.ts",
          line: 42,
          original_line: null,
          created_at: "2024-01-01T00:00:00Z",
        },
        {
          id: 101,
          user: { login: "reviewer2", avatar_url: "https://avatar.url" },
          body: "Looks good",
          path: null,
          line: null,
          original_line: null,
          created_at: "2024-01-02T00:00:00Z",
        },
      ]);
      mockGetOctokit.mockReturnValue(octokit);

      const count = await syncPRComments("owner/repo", 1);

      expect(count).toBe(2);
      expect(mockExecute).toHaveBeenCalledTimes(2);
    });
  });

  describe("getConnectedRepos", () => {
    it("returns all repos", async () => {
      mockQueryAll.mockResolvedValue([
        {
          id: "owner/repo",
          owner: "owner",
          name: "repo",
          full_name: "owner/repo",
          default_branch: "main",
          last_synced_at: "2024-01-01T00:00:00Z",
        },
      ]);

      const repos = await getConnectedRepos();

      expect(repos).toHaveLength(1);
      expect(repos[0].id).toBe("owner/repo");
    });
  });

  describe("removeRepo", () => {
    it("deletes repo and all cascaded data", async () => {
      await removeRepo("owner/repo");

      // Should delete in order: fixes, skills, analyses, plans, comments, prs, repo
      expect(mockExecute).toHaveBeenCalledTimes(7);
      // Last call should be the repos delete
      const lastCall = mockExecute.mock.calls[6];
      expect(lastCall[1]).toContain("DELETE FROM repos");
    });
  });
});
