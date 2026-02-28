import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
  execute: vi.fn(),
  queryAll: vi.fn(),
  queryOne: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  createServiceLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock("@/lib/github", () => ({
  getOctokit: vi.fn(),
  hasValidPATSync: vi.fn(),
}));

vi.mock("@/lib/services/session-manager", () => ({
  createSession: vi.fn().mockResolvedValue("mock-session-id"),
  startSession: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/services/session-runners/account-sync", () => ({
  createAccountSyncRunner: vi.fn().mockReturnValue(vi.fn()),
}));

import { execute, getDb, queryAll, queryOne } from "@/lib/db";
import { getOctokit, hasValidPATSync } from "@/lib/github";
import { createSession, startSession } from "@/lib/services/session-manager";
import { createAccountSyncRunner } from "@/lib/services/session-runners/account-sync";
import { getAccountPRs, getAccountStats, getAuthenticatedUser, hasValidPAT, startAccountSync } from "./account";

const mockGetDb = vi.mocked(getDb);
const mockExecute = vi.mocked(execute);
const mockQueryAll = vi.mocked(queryAll);
const mockQueryOne = vi.mocked(queryOne);
const mockGetOctokit = vi.mocked(getOctokit);
const mockHasValidPATSync = vi.mocked(hasValidPATSync);
const mockCreateSession = vi.mocked(createSession);
const mockStartSession = vi.mocked(startSession);
const mockCreateAccountSyncRunner = vi.mocked(createAccountSyncRunner);

function createMockOctokit(getAuthenticated: ReturnType<typeof vi.fn>): ReturnType<typeof getOctokit> {
  // biome-ignore lint/suspicious/noExplicitAny: Test mock — partial Octokit structure
  const mock: any = { rest: { users: { getAuthenticated } } };
  return mock;
}

describe("account actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDb.mockResolvedValue({} as Awaited<ReturnType<typeof getDb>>);
  });

  describe("hasValidPAT", () => {
    it("returns true when PAT is valid", async () => {
      mockHasValidPATSync.mockReturnValue(true);
      const result = await hasValidPAT();
      expect(result).toBe(true);
    });

    it("returns false when PAT is invalid", async () => {
      mockHasValidPATSync.mockReturnValue(false);
      const result = await hasValidPAT();
      expect(result).toBe(false);
    });
  });

  describe("getAuthenticatedUser", () => {
    it("returns null when PAT is invalid", async () => {
      mockHasValidPATSync.mockReturnValue(false);
      const result = await getAuthenticatedUser();
      expect(result).toBeNull();
    });

    it("returns cached user when cache is fresh (under 1 hour)", async () => {
      mockHasValidPATSync.mockReturnValue(true);
      const recentDate = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // 30 min ago
      mockQueryOne.mockResolvedValue({
        id: "123",
        login: "testuser",
        avatar_url: "https://example.com/avatar.png",
        name: "Test User",
        fetched_at: recentDate,
      });

      const result = await getAuthenticatedUser();

      expect(result).toEqual({
        id: "123",
        login: "testuser",
        avatarUrl: "https://example.com/avatar.png",
        name: "Test User",
      });
      expect(mockGetOctokit).not.toHaveBeenCalled();
    });

    it("fetches from GitHub when cache is stale (over 1 hour)", async () => {
      mockHasValidPATSync.mockReturnValue(true);
      const staleDate = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2 hours ago
      mockQueryOne.mockResolvedValue({
        id: "123",
        login: "olduser",
        avatar_url: null,
        name: null,
        fetched_at: staleDate,
      });

      const mockOctokit = createMockOctokit(
        vi.fn().mockResolvedValue({
          data: {
            id: 456,
            login: "newuser",
            avatar_url: "https://example.com/new-avatar.png",
            name: "New User",
          },
        }),
      );
      mockGetOctokit.mockReturnValue(mockOctokit);

      const result = await getAuthenticatedUser();

      expect(result).toEqual({
        id: "456",
        login: "newuser",
        avatarUrl: "https://example.com/new-avatar.png",
        name: "New User",
      });
      expect(mockExecute).toHaveBeenCalledWith({}, expect.stringContaining("INSERT INTO github_user"), [
        "456",
        "newuser",
        "https://example.com/new-avatar.png",
        "New User",
      ]);
    });

    it("fetches from GitHub when no cache exists", async () => {
      mockHasValidPATSync.mockReturnValue(true);
      mockQueryOne.mockResolvedValue(null);

      const mockOctokit = createMockOctokit(
        vi.fn().mockResolvedValue({
          data: {
            id: 789,
            login: "freshuser",
            avatar_url: null,
            name: "Fresh User",
          },
        }),
      );
      mockGetOctokit.mockReturnValue(mockOctokit);

      const result = await getAuthenticatedUser();

      expect(result).toEqual({
        id: "789",
        login: "freshuser",
        avatarUrl: null,
        name: "Fresh User",
      });
    });

    it("throws a descriptive error when GitHub API fails", async () => {
      mockHasValidPATSync.mockReturnValue(true);
      mockQueryOne.mockResolvedValue(null);

      const mockOctokit = createMockOctokit(vi.fn().mockRejectedValue(new Error("Bad credentials")));
      mockGetOctokit.mockReturnValue(mockOctokit);

      await expect(getAuthenticatedUser()).rejects.toThrow(
        "GitHub authentication failed: Bad credentials. Check that your PAT is valid and not expired.",
      );
    });

    it("throws a descriptive error for non-Error exceptions", async () => {
      mockHasValidPATSync.mockReturnValue(true);
      mockQueryOne.mockResolvedValue(null);

      const mockOctokit = createMockOctokit(vi.fn().mockRejectedValue("string error"));
      mockGetOctokit.mockReturnValue(mockOctokit);

      await expect(getAuthenticatedUser()).rejects.toThrow(
        "GitHub authentication failed: Unknown error. Check that your PAT is valid and not expired.",
      );
    });
  });

  describe("startAccountSync", () => {
    it("creates a session and starts it with the account sync runner", async () => {
      const mockRunner = vi.fn();
      mockCreateAccountSyncRunner.mockReturnValue(mockRunner);

      const result = await startAccountSync();

      expect(mockCreateSession).toHaveBeenCalledWith({
        sessionType: "account_sync",
        label: "Account PR sync",
        metadata: {},
      });
      expect(mockCreateAccountSyncRunner).toHaveBeenCalledWith({});
      expect(mockStartSession).toHaveBeenCalledWith("mock-session-id", mockRunner);
      expect(result).toBe("mock-session-id");
    });
  });

  describe("getAccountPRs", () => {
    const makePR = (overrides: Record<string, unknown> = {}) => ({
      id: "pr-1",
      repo_id: "repo-1",
      number: 42,
      title: "Test PR",
      author: "testuser",
      author_avatar: null,
      branch: "feature/test",
      size: "M",
      lines_added: 50,
      lines_deleted: 20,
      files_changed: 3,
      review_status: "approved",
      state: "open",
      complexity: null,
      github_created_at: "2025-01-01T00:00:00Z",
      github_updated_at: "2025-01-02T00:00:00Z",
      fetched_at: "2025-01-03T00:00:00Z",
      user_relationship: "authored",
      html_url: "https://github.com/test/repo/pull/42",
      repo_full_name: "test/repo",
      comment_count: 5,
      ...overrides,
    });

    it("returns mapped PRs with default filters", async () => {
      mockQueryAll.mockResolvedValue([makePR()]);

      const result = await getAccountPRs();

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: "pr-1",
        repoId: "repo-1",
        number: 42,
        title: "Test PR",
        author: "testuser",
        authorAvatar: null,
        branch: "feature/test",
        size: "M",
        linesAdded: 50,
        linesDeleted: 20,
        filesChanged: 3,
        reviewStatus: "approved",
        state: "open",
        complexity: null,
        githubCreatedAt: "2025-01-01T00:00:00Z",
        githubUpdatedAt: "2025-01-02T00:00:00Z",
        fetchedAt: "2025-01-03T00:00:00Z",
        userRelationship: "authored",
        htmlUrl: "https://github.com/test/repo/pull/42",
        repoFullName: "test/repo",
        commentCount: 5,
        feedbackCategories: [],
      });
    });

    it("applies relationship filter", async () => {
      mockQueryAll.mockResolvedValue([]);

      await getAccountPRs({ relationship: "authored" });

      expect(mockQueryAll).toHaveBeenCalledWith({}, expect.stringContaining("p.user_relationship = ?"), [
        "authored",
        100,
        0,
      ]);
    });

    it("applies state filter", async () => {
      mockQueryAll.mockResolvedValue([]);

      await getAccountPRs({ state: "open" });

      expect(mockQueryAll).toHaveBeenCalledWith({}, expect.stringContaining("p.state = ?"), ["open", 100, 0]);
    });

    it("applies size filter", async () => {
      mockQueryAll.mockResolvedValue([]);

      await getAccountPRs({ size: "XL" });

      expect(mockQueryAll).toHaveBeenCalledWith({}, expect.stringContaining("p.size = ?"), ["XL", 100, 0]);
    });

    it("applies search filter with ILIKE patterns", async () => {
      mockQueryAll.mockResolvedValue([]);

      await getAccountPRs({ search: "fix" });

      expect(mockQueryAll).toHaveBeenCalledWith({}, expect.stringContaining("p.title ILIKE ?"), [
        "%fix%",
        "%fix%",
        "%fix%",
        100,
        0,
      ]);
    });

    it("applies multiple filters together", async () => {
      mockQueryAll.mockResolvedValue([]);

      await getAccountPRs({ relationship: "reviewed", state: "closed", size: "L", search: "bug" });

      const call = mockQueryAll.mock.calls[0];
      const sql = call[1] as string;
      expect(sql).toContain("p.user_relationship = ?");
      expect(sql).toContain("p.state = ?");
      expect(sql).toContain("p.size = ?");
      expect(sql).toContain("p.title ILIKE ?");
      expect(call[2]).toEqual(["reviewed", "closed", "L", "%bug%", "%bug%", "%bug%", 100, 0]);
    });

    it("sorts by created date", async () => {
      mockQueryAll.mockResolvedValue([]);

      await getAccountPRs({ sort: "created" });

      expect(mockQueryAll).toHaveBeenCalledWith(
        {},
        expect.stringContaining("p.github_created_at DESC NULLS LAST"),
        [100, 0],
      );
    });

    it("sorts by comments", async () => {
      mockQueryAll.mockResolvedValue([]);

      await getAccountPRs({ sort: "comments" });

      expect(mockQueryAll).toHaveBeenCalledWith({}, expect.stringContaining("comment_count DESC"), [100, 0]);
    });

    it("sorts by updated date by default", async () => {
      mockQueryAll.mockResolvedValue([]);

      await getAccountPRs();

      expect(mockQueryAll).toHaveBeenCalledWith(
        {},
        expect.stringContaining("p.github_updated_at DESC NULLS LAST"),
        [100, 0],
      );
    });

    it("applies custom limit and offset", async () => {
      mockQueryAll.mockResolvedValue([]);

      await getAccountPRs({ limit: 10, offset: 20 });

      expect(mockQueryAll).toHaveBeenCalledWith({}, expect.stringContaining("LIMIT ? OFFSET ?"), [10, 20]);
    });
  });

  describe("getAccountStats", () => {
    it("returns aggregated account stats", async () => {
      mockQueryOne
        .mockResolvedValueOnce({ count: 42 }) // total PRs
        .mockResolvedValueOnce({ count: 5 }) // repos
        .mockResolvedValueOnce({ count: 120 }) // comments
        .mockResolvedValueOnce({ count: 30 }) // authored
        .mockResolvedValueOnce({ count: 12 }) // reviewed
        .mockResolvedValueOnce({ avg_lines: 156.7 }) // avg lines
        .mockResolvedValueOnce({ count: 3 }) // splittable
        .mockResolvedValueOnce({ name: "Error Handling" }); // top skill

      const result = await getAccountStats();

      expect(result).toEqual({
        totalPRs: 42,
        totalRepos: 5,
        totalComments: 120,
        prsAuthored: 30,
        prsReviewed: 12,
        avgLinesChanged: 157,
        topSkillGap: "Error Handling",
        splittablePRs: 3,
      });
    });

    it("returns defaults when queries return null", async () => {
      mockQueryOne.mockResolvedValue(null);

      const result = await getAccountStats();

      expect(result).toEqual({
        totalPRs: 0,
        totalRepos: 0,
        totalComments: 0,
        prsAuthored: 0,
        prsReviewed: 0,
        avgLinesChanged: 0,
        topSkillGap: null,
        splittablePRs: 0,
      });
    });

    it("rounds avgLinesChanged correctly", async () => {
      mockQueryOne
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ avg_lines: 99.4 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce(null);

      const result = await getAccountStats();
      expect(result.avgLinesChanged).toBe(99);
    });
  });
});
