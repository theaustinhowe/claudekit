import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
}));

vi.mock("@claudekit/duckdb", () => ({
  queryAll: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
}));

vi.mock("@/lib/github", () => ({
  getOctokit: vi.fn(),
}));

vi.mock("@/lib/actions/account", () => ({
  getAuthenticatedUser: vi.fn(),
}));

vi.mock("@/lib/constants", () => ({
  classifyPRSize: vi.fn().mockReturnValue("S"),
}));

import { execute, queryAll, queryOne } from "@claudekit/duckdb";
import { getAuthenticatedUser } from "@/lib/actions/account";
import { getOctokit } from "@/lib/github";
import { createAccountSyncRunner } from "./account-sync";

const mockExecute = vi.mocked(execute);
const mockQueryAll = vi.mocked(queryAll);
const mockQueryOne = vi.mocked(queryOne);
const mockGetAuthenticatedUser = vi.mocked(getAuthenticatedUser);
const mockGetOctokit = vi.mocked(getOctokit);

function createTestContext(overrides?: { signal?: AbortSignal }) {
  const controller = new AbortController();
  return {
    onProgress: vi.fn(),
    signal: overrides?.signal ?? controller.signal,
    sessionId: "test-session-id",
    controller,
  };
}

function makeSearchResponse(items: Array<Record<string, unknown>>, totalCount?: number) {
  return {
    data: {
      total_count: totalCount ?? items.length,
      items,
    },
  };
}

function makePRItem(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    html_url: "https://github.com/owner/repo/pull/1",
    number: 1,
    title: "Test PR",
    user: { login: "testuser", avatar_url: "https://avatar.url" },
    state: "open",
    draft: false,
    pull_request: { merged_at: null },
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-02T00:00:00Z",
    ...overrides,
  };
}

describe("createAccountSyncRunner", () => {
  let mockOctokit: {
    rest: {
      search: { issuesAndPullRequests: ReturnType<typeof vi.fn> };
      pulls: { get: ReturnType<typeof vi.fn> };
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockOctokit = {
      rest: {
        search: { issuesAndPullRequests: vi.fn() },
        pulls: { get: vi.fn() },
      },
    };
    mockGetOctokit.mockReturnValue(mockOctokit as unknown as ReturnType<typeof getOctokit>);
  });

  it("throws if no authenticated user", async () => {
    mockGetAuthenticatedUser.mockResolvedValue(null);
    const runner = createAccountSyncRunner({});
    const ctx = createTestContext();

    await expect(runner(ctx)).rejects.toThrow("No authenticated user");
  });

  it("runs the happy path with search, dedup, and enrichment", async () => {
    mockGetAuthenticatedUser.mockResolvedValue({
      id: "1",
      login: "testuser",
      avatarUrl: null,
      name: "Test User",
    });

    const prItem = makePRItem();

    // All 3 search queries return the same PR (testing dedup)
    mockOctokit.rest.search.issuesAndPullRequests
      .mockResolvedValueOnce(makeSearchResponse([prItem]))
      .mockResolvedValueOnce(makeSearchResponse([prItem]))
      .mockResolvedValueOnce(makeSearchResponse([]));

    // queryOne for repo existence check (repo not found => insert)
    mockQueryOne.mockResolvedValue(undefined);

    // enrichment phase: query PRs to enrich
    mockQueryAll.mockResolvedValue([]);

    const runner = createAccountSyncRunner({});
    const ctx = createTestContext();
    const result = await runner(ctx);

    expect(result).toEqual({ result: { totalSynced: 1, reposDiscovered: 1 } });
    expect(mockOctokit.rest.search.issuesAndPullRequests).toHaveBeenCalledTimes(3);

    // Verify repo was inserted (only once due to dedup)
    expect(mockExecute).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("INSERT INTO repos"),
      expect.arrayContaining(["owner/repo", "owner", "repo", "owner/repo"]),
    );
  });

  it("deduplicates PRs across search types", async () => {
    mockGetAuthenticatedUser.mockResolvedValue({
      id: "1",
      login: "testuser",
      avatarUrl: null,
      name: "Test User",
    });

    const prItem1 = makePRItem();
    const prItem2 = makePRItem({
      html_url: "https://github.com/owner/repo/pull/2",
      number: 2,
      title: "PR 2",
    });

    // Author query returns PR 1 and 2
    mockOctokit.rest.search.issuesAndPullRequests
      .mockResolvedValueOnce(makeSearchResponse([prItem1, prItem2]))
      // Reviewer query returns PR 1 (duplicate)
      .mockResolvedValueOnce(makeSearchResponse([prItem1]))
      // Assigned returns nothing
      .mockResolvedValueOnce(makeSearchResponse([]));

    // First repo check returns undefined (new repo), subsequent checks find it already inserted
    mockQueryOne
      .mockResolvedValueOnce(undefined) // PR 1: repo not found => insert
      .mockResolvedValueOnce({ id: "owner/repo" }); // PR 2: repo already exists
    mockQueryAll.mockResolvedValue([]);

    const runner = createAccountSyncRunner({});
    const ctx = createTestContext();
    const result = await runner(ctx);

    // Should have 2 unique PRs, not 3
    expect(result).toEqual({ result: { totalSynced: 2, reposDiscovered: 1 } });
  });

  it("classifies merged PRs correctly", async () => {
    mockGetAuthenticatedUser.mockResolvedValue({
      id: "1",
      login: "testuser",
      avatarUrl: null,
      name: "Test User",
    });

    const mergedPR = makePRItem({
      state: "closed",
      pull_request: { merged_at: "2025-01-03T00:00:00Z" },
    });

    mockOctokit.rest.search.issuesAndPullRequests
      .mockResolvedValueOnce(makeSearchResponse([mergedPR]))
      .mockResolvedValueOnce(makeSearchResponse([]))
      .mockResolvedValueOnce(makeSearchResponse([]));

    mockQueryOne.mockResolvedValue(undefined);
    mockQueryAll.mockResolvedValue([]);

    const runner = createAccountSyncRunner({});
    const ctx = createTestContext();
    await runner(ctx);

    // Check the INSERT included "Merged" review status
    const prInsertCall = mockExecute.mock.calls.find(
      (call) => typeof call[1] === "string" && call[1].includes("INSERT INTO prs"),
    );
    expect(prInsertCall).toBeDefined();
    expect(prInsertCall?.[2]).toContain("Merged");
  });

  it("classifies draft PRs correctly", async () => {
    mockGetAuthenticatedUser.mockResolvedValue({
      id: "1",
      login: "testuser",
      avatarUrl: null,
      name: "Test User",
    });

    const draftPR = makePRItem({ draft: true });

    mockOctokit.rest.search.issuesAndPullRequests
      .mockResolvedValueOnce(makeSearchResponse([draftPR]))
      .mockResolvedValueOnce(makeSearchResponse([]))
      .mockResolvedValueOnce(makeSearchResponse([]));

    mockQueryOne.mockResolvedValue(undefined);
    mockQueryAll.mockResolvedValue([]);

    const runner = createAccountSyncRunner({});
    const ctx = createTestContext();
    await runner(ctx);

    const prInsertCall = mockExecute.mock.calls.find(
      (call) => typeof call[1] === "string" && call[1].includes("INSERT INTO prs"),
    );
    expect(prInsertCall).toBeDefined();
    expect(prInsertCall?.[2]).toContain("Draft");
  });

  it("handles pagination across pages", async () => {
    mockGetAuthenticatedUser.mockResolvedValue({
      id: "1",
      login: "testuser",
      avatarUrl: null,
      name: "Test User",
    });

    // Generate 100 items for page 1 (triggers pagination)
    const page1Items = Array.from({ length: 100 }, (_, i) =>
      makePRItem({
        html_url: `https://github.com/owner/repo/pull/${i + 1}`,
        number: i + 1,
        title: `PR ${i + 1}`,
      }),
    );
    const page2Items = [
      makePRItem({
        html_url: "https://github.com/owner/repo/pull/101",
        number: 101,
        title: "PR 101",
      }),
    ];

    mockOctokit.rest.search.issuesAndPullRequests
      .mockResolvedValueOnce(makeSearchResponse(page1Items, 101)) // page 1
      .mockResolvedValueOnce(makeSearchResponse(page2Items, 101)) // page 2
      .mockResolvedValueOnce(makeSearchResponse([])) // reviewed query
      .mockResolvedValueOnce(makeSearchResponse([])); // assigned query

    // First repo check returns undefined (new repo), all subsequent find it
    mockQueryOne
      .mockResolvedValueOnce(undefined) // PR 1: repo not found => insert
      .mockResolvedValue({ id: "owner/repo" }); // All subsequent: repo already exists
    mockQueryAll.mockResolvedValue([]);

    const runner = createAccountSyncRunner({});
    const ctx = createTestContext();
    const result = await runner(ctx);

    expect(result).toEqual({ result: { totalSynced: 101, reposDiscovered: 1 } });
    // Should have called search at least 4 times (2 pages + 2 empty queries)
    expect(mockOctokit.rest.search.issuesAndPullRequests).toHaveBeenCalledTimes(4);
  });

  it("enriches PRs with line counts", async () => {
    mockGetAuthenticatedUser.mockResolvedValue({
      id: "1",
      login: "testuser",
      avatarUrl: null,
      name: "Test User",
    });

    mockOctokit.rest.search.issuesAndPullRequests
      .mockResolvedValueOnce(makeSearchResponse([]))
      .mockResolvedValueOnce(makeSearchResponse([]))
      .mockResolvedValueOnce(makeSearchResponse([]));

    // PRs to enrich
    mockQueryAll.mockResolvedValue([{ id: "owner/repo#1", repo_id: "owner/repo", number: 1 }]);

    // repo lookup for enrichment
    mockQueryOne.mockResolvedValue({ owner: "owner", name: "repo" });

    // Pulls get response
    mockOctokit.rest.pulls.get.mockResolvedValue({
      data: {
        additions: 50,
        deletions: 20,
        changed_files: 3,
        head: { ref: "feature-branch" },
        user: { avatar_url: "https://avatar.url" },
      },
    });

    const runner = createAccountSyncRunner({});
    const ctx = createTestContext();
    await runner(ctx);

    expect(mockOctokit.rest.pulls.get).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      pull_number: 1,
    });

    // Verify UPDATE with line counts
    const updateCall = mockExecute.mock.calls.find(
      (call) => typeof call[1] === "string" && call[1].includes("UPDATE prs SET"),
    );
    expect(updateCall).toBeDefined();
    expect(updateCall?.[2]).toContain(50); // lines_added
    expect(updateCall?.[2]).toContain(20); // lines_deleted
  });

  it("skips enrichment for inaccessible PRs", async () => {
    mockGetAuthenticatedUser.mockResolvedValue({
      id: "1",
      login: "testuser",
      avatarUrl: null,
      name: "Test User",
    });

    mockOctokit.rest.search.issuesAndPullRequests
      .mockResolvedValueOnce(makeSearchResponse([]))
      .mockResolvedValueOnce(makeSearchResponse([]))
      .mockResolvedValueOnce(makeSearchResponse([]));

    mockQueryAll.mockResolvedValue([{ id: "owner/repo#1", repo_id: "owner/repo", number: 1 }]);
    mockQueryOne.mockResolvedValue({ owner: "owner", name: "repo" });

    // Pulls get fails
    mockOctokit.rest.pulls.get.mockRejectedValue(new Error("Not Found"));

    const runner = createAccountSyncRunner({});
    const ctx = createTestContext();

    // Should not throw -- skips inaccessible PRs
    await expect(runner(ctx)).resolves.toBeDefined();
  });

  it("aborts during search phase", async () => {
    mockGetAuthenticatedUser.mockResolvedValue({
      id: "1",
      login: "testuser",
      avatarUrl: null,
      name: "Test User",
    });

    const controller = new AbortController();
    controller.abort();

    const runner = createAccountSyncRunner({});
    const ctx = createTestContext({ signal: controller.signal });

    await expect(runner(ctx)).rejects.toThrow("Aborted");
  });

  it("continues when a search query fails", async () => {
    mockGetAuthenticatedUser.mockResolvedValue({
      id: "1",
      login: "testuser",
      avatarUrl: null,
      name: "Test User",
    });

    mockOctokit.rest.search.issuesAndPullRequests
      .mockRejectedValueOnce(new Error("Rate limited")) // authored fails
      .mockResolvedValueOnce(makeSearchResponse([makePRItem()])) // reviewed succeeds
      .mockResolvedValueOnce(makeSearchResponse([])); // assigned empty

    mockQueryOne.mockResolvedValue(undefined);
    mockQueryAll.mockResolvedValue([]);

    const runner = createAccountSyncRunner({});
    const ctx = createTestContext();
    const result = await runner(ctx);

    // Should have 1 PR from the reviewed query
    expect(result).toEqual({ result: { totalSynced: 1, reposDiscovered: 1 } });

    // Should have logged the warning
    expect(ctx.onProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        logType: "warning",
        log: expect.stringContaining("authored search failed"),
      }),
    );
  });

  it("reports progress at correct phases", async () => {
    mockGetAuthenticatedUser.mockResolvedValue({
      id: "1",
      login: "testuser",
      avatarUrl: null,
      name: "Test User",
    });

    mockOctokit.rest.search.issuesAndPullRequests
      .mockResolvedValueOnce(makeSearchResponse([]))
      .mockResolvedValueOnce(makeSearchResponse([]))
      .mockResolvedValueOnce(makeSearchResponse([]));

    mockQueryAll.mockResolvedValue([]);

    const runner = createAccountSyncRunner({});
    const ctx = createTestContext();
    await runner(ctx);

    const phases = ctx.onProgress.mock.calls.map((c: unknown[]) => (c[0] as { phase?: string }).phase).filter(Boolean);
    expect(phases).toContain("Authenticating");
    expect(phases).toContain("Searching PRs");
    expect(phases).toContain("Enriching PRs");
    expect(phases).toContain("Complete");
  });

  it("handles existing repo (no duplicate insert)", async () => {
    mockGetAuthenticatedUser.mockResolvedValue({
      id: "1",
      login: "testuser",
      avatarUrl: null,
      name: "Test User",
    });

    mockOctokit.rest.search.issuesAndPullRequests
      .mockResolvedValueOnce(makeSearchResponse([makePRItem()]))
      .mockResolvedValueOnce(makeSearchResponse([]))
      .mockResolvedValueOnce(makeSearchResponse([]));

    // Repo already exists
    mockQueryOne.mockResolvedValue({ id: "owner/repo" });
    mockQueryAll.mockResolvedValue([]);

    const runner = createAccountSyncRunner({});
    const ctx = createTestContext();
    const result = await runner(ctx);

    expect(result).toEqual({ result: { totalSynced: 1, reposDiscovered: 0 } });

    // Should NOT have inserted a repo
    const repoInsertCalls = mockExecute.mock.calls.filter(
      (call) => typeof call[1] === "string" && call[1].includes("INSERT INTO repos"),
    );
    expect(repoInsertCalls).toHaveLength(0);
  });
});
