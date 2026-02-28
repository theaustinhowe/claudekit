import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
}));

vi.mock("@claudekit/duckdb", () => ({
  queryOne: vi.fn(),
  execute: vi.fn(),
}));

vi.mock("@/lib/git-operations", () => ({
  cloneOrUpdateRepo: vi.fn(),
  createBranch: vi.fn(),
  checkoutFiles: vi.fn(),
  commitAndPush: vi.fn(),
  createGitHubPR: vi.fn(),
  getPAT: vi.fn(),
}));

import { execute, queryOne } from "@claudekit/duckdb";
import {
  checkoutFiles,
  cloneOrUpdateRepo,
  commitAndPush,
  createBranch,
  createGitHubPR,
  getPAT,
} from "@/lib/git-operations";
import { createSplitExecutionRunner } from "./split-execution";

const mockQueryOne = vi.mocked(queryOne);
const mockExecute = vi.mocked(execute);
const mockCloneOrUpdateRepo = vi.mocked(cloneOrUpdateRepo);
const mockCreateBranch = vi.mocked(createBranch);
const mockCheckoutFiles = vi.mocked(checkoutFiles);
const mockCommitAndPush = vi.mocked(commitAndPush);
const mockCreateGitHubPR = vi.mocked(createGitHubPR);
const mockGetPAT = vi.mocked(getPAT);

function createTestContext(overrides?: { signal?: AbortSignal }) {
  const controller = new AbortController();
  return {
    onProgress: vi.fn(),
    signal: overrides?.signal ?? controller.signal,
    sessionId: "test-session-id",
    controller,
  };
}

describe("createSplitExecutionRunner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPAT.mockReturnValue("ghp_test_token");
    mockCloneOrUpdateRepo.mockResolvedValue("/tmp/repos/owner/repo");
    mockCreateBranch.mockResolvedValue(undefined);
    mockCheckoutFiles.mockResolvedValue(undefined);
    mockCommitAndPush.mockResolvedValue("");
  });

  it("runs happy path: creates branches, sub-PRs, and pushes", async () => {
    const subPRs = [
      {
        index: 1,
        total: 2,
        title: "Refactor utils",
        files: [{ path: "src/utils.ts" }],
        dependsOn: [],
        description: "Refactor utility functions",
        checklist: ["Tests pass"],
      },
      {
        index: 2,
        total: 2,
        title: "Add feature",
        files: [{ path: "src/feature.ts" }],
        dependsOn: [1],
        description: "New feature",
        checklist: ["Integration test"],
      },
    ];

    mockQueryOne
      .mockResolvedValueOnce({
        id: "plan1",
        pr_id: "repo1#1",
        total_lines: 700,
        sub_prs: JSON.stringify(subPRs),
      }) // plan
      .mockResolvedValueOnce({ repo_id: "repo1", number: 1, title: "Big PR", branch: "feature" }) // PR
      .mockResolvedValueOnce({ owner: "owner", name: "repo", default_branch: "main" }); // repo

    mockCreateGitHubPR
      .mockResolvedValueOnce({ number: 10, url: "https://github.com/owner/repo/pull/10" })
      .mockResolvedValueOnce({ number: 11, url: "https://github.com/owner/repo/pull/11" });

    const runner = createSplitExecutionRunner({ planId: "plan1" });
    const ctx = createTestContext();
    const result = await runner(ctx);

    expect(result.result).toEqual({
      planId: "plan1",
      createdPRs: [
        { index: 1, number: 10, url: "https://github.com/owner/repo/pull/10" },
        { index: 2, number: 11, url: "https://github.com/owner/repo/pull/11" },
      ],
    });

    // Verify branches were created
    expect(mockCreateBranch).toHaveBeenCalledTimes(2);
    expect(mockCreateBranch).toHaveBeenCalledWith("/tmp/repos/owner/repo", "main", expect.stringContaining("split/1/"));

    // Verify files were checked out from the PR branch
    expect(mockCheckoutFiles).toHaveBeenCalledTimes(2);

    // Verify GitHub PRs were created
    expect(mockCreateGitHubPR).toHaveBeenCalledTimes(2);
    expect(mockCreateGitHubPR).toHaveBeenCalledWith(
      "owner",
      "repo",
      expect.stringContaining("split/1/"),
      "main",
      "Refactor utils",
      expect.any(String),
    );
  });

  it("sorts sub-PRs by dependency order", async () => {
    // Sub-PR 2 depends on sub-PR 1, but they're given in reverse order
    const subPRs = [
      {
        index: 2,
        total: 2,
        title: "Depends on 1",
        files: [{ path: "src/b.ts" }],
        dependsOn: [1],
        description: "Second",
        checklist: [],
      },
      {
        index: 1,
        total: 2,
        title: "Base change",
        files: [{ path: "src/a.ts" }],
        dependsOn: [],
        description: "First",
        checklist: [],
      },
    ];

    mockQueryOne
      .mockResolvedValueOnce({
        id: "plan1",
        pr_id: "repo1#1",
        total_lines: 500,
        sub_prs: JSON.stringify(subPRs),
      })
      .mockResolvedValueOnce({ repo_id: "repo1", number: 1, title: "PR", branch: "feature" })
      .mockResolvedValueOnce({ owner: "owner", name: "repo", default_branch: "main" });

    mockCreateGitHubPR
      .mockResolvedValueOnce({ number: 10, url: "https://github.com/owner/repo/pull/10" })
      .mockResolvedValueOnce({ number: 11, url: "https://github.com/owner/repo/pull/11" });

    const runner = createSplitExecutionRunner({ planId: "plan1" });
    const ctx = createTestContext();
    const result = await runner(ctx);

    // Ensure first created PR has index 1 (was processed first)
    expect(result.result?.createdPRs).toEqual([
      { index: 1, number: 10, url: "https://github.com/owner/repo/pull/10" },
      { index: 2, number: 11, url: "https://github.com/owner/repo/pull/11" },
    ]);
  });

  it("includes dependency references in PR body", async () => {
    const subPRs = [
      {
        index: 1,
        total: 2,
        title: "Base",
        files: [{ path: "src/a.ts" }],
        dependsOn: [],
        description: "Base change",
        checklist: ["Test"],
      },
      {
        index: 2,
        total: 2,
        title: "Dependent",
        files: [{ path: "src/b.ts" }],
        dependsOn: [1],
        description: "Depends on base",
        checklist: ["Verify"],
      },
    ];

    mockQueryOne
      .mockResolvedValueOnce({
        id: "plan1",
        pr_id: "repo1#1",
        total_lines: 500,
        sub_prs: JSON.stringify(subPRs),
      })
      .mockResolvedValueOnce({ repo_id: "repo1", number: 1, title: "PR", branch: "feature" })
      .mockResolvedValueOnce({ owner: "owner", name: "repo", default_branch: "main" });

    mockCreateGitHubPR
      .mockResolvedValueOnce({ number: 10, url: "https://github.com/owner/repo/pull/10" })
      .mockResolvedValueOnce({ number: 11, url: "https://github.com/owner/repo/pull/11" });

    const runner = createSplitExecutionRunner({ planId: "plan1" });
    const ctx = createTestContext();
    await runner(ctx);

    // Second PR should reference dependency
    const secondPRCall = mockCreateGitHubPR.mock.calls[1];
    expect(secondPRCall[5]).toContain("Depends on #10");
  });

  it("throws when plan not found", async () => {
    mockQueryOne.mockResolvedValueOnce(undefined);

    const runner = createSplitExecutionRunner({ planId: "nonexistent" });
    const ctx = createTestContext();

    await expect(runner(ctx)).rejects.toThrow("Split plan not found");
  });

  it("throws when PR not found", async () => {
    mockQueryOne
      .mockResolvedValueOnce({
        id: "plan1",
        pr_id: "repo1#1",
        total_lines: 500,
        sub_prs: "[]",
      })
      .mockResolvedValueOnce(undefined); // PR not found

    const runner = createSplitExecutionRunner({ planId: "plan1" });
    const ctx = createTestContext();

    await expect(runner(ctx)).rejects.toThrow("PR not found");
  });

  it("throws when repo not found", async () => {
    mockQueryOne
      .mockResolvedValueOnce({
        id: "plan1",
        pr_id: "repo1#1",
        total_lines: 500,
        sub_prs: "[]",
      })
      .mockResolvedValueOnce({ repo_id: "repo1", number: 1, title: "PR", branch: "feature" })
      .mockResolvedValueOnce(undefined); // repo not found

    const runner = createSplitExecutionRunner({ planId: "plan1" });
    const ctx = createTestContext();

    await expect(runner(ctx)).rejects.toThrow("Repo not found");
  });

  it("continues creating remaining sub-PRs when one fails", async () => {
    const subPRs = [
      {
        index: 1,
        total: 2,
        title: "Sub PR 1",
        files: [{ path: "src/a.ts" }],
        dependsOn: [],
        description: "First",
        checklist: [],
      },
      {
        index: 2,
        total: 2,
        title: "Sub PR 2",
        files: [{ path: "src/b.ts" }],
        dependsOn: [],
        description: "Second",
        checklist: [],
      },
    ];

    mockQueryOne
      .mockResolvedValueOnce({
        id: "plan1",
        pr_id: "repo1#1",
        total_lines: 500,
        sub_prs: JSON.stringify(subPRs),
      })
      .mockResolvedValueOnce({ repo_id: "repo1", number: 1, title: "PR", branch: "feature" })
      .mockResolvedValueOnce({ owner: "owner", name: "repo", default_branch: "main" });

    // First branch creation fails
    mockCreateBranch.mockRejectedValueOnce(new Error("Branch already exists")).mockResolvedValueOnce(undefined);

    mockCreateGitHubPR.mockResolvedValueOnce({ number: 11, url: "https://github.com/owner/repo/pull/11" });

    const runner = createSplitExecutionRunner({ planId: "plan1" });
    const ctx = createTestContext();
    const result = await runner(ctx);

    // Only second sub-PR should succeed
    expect(result.result?.createdPRs).toHaveLength(1);
    expect(result.result?.createdPRs).toEqual([{ index: 2, number: 11, url: "https://github.com/owner/repo/pull/11" }]);

    // Verify failure was recorded
    expect(mockExecute).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("UPDATE split_executions SET status = 'failed'"),
      expect.arrayContaining(["Branch already exists"]),
    );

    // Verify error was logged
    expect(ctx.onProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        logType: "error",
        log: expect.stringContaining("Failed sub-PR 1"),
      }),
    );
  });

  it("handles sub_prs as already-parsed object", async () => {
    const subPRs = [
      {
        index: 1,
        total: 1,
        title: "Only sub-PR",
        files: [{ path: "src/a.ts" }],
        dependsOn: [],
        description: "Single PR",
        checklist: [],
      },
    ];

    mockQueryOne
      .mockResolvedValueOnce({
        id: "plan1",
        pr_id: "repo1#1",
        total_lines: 100,
        sub_prs: subPRs, // Already an object, not a string
      })
      .mockResolvedValueOnce({ repo_id: "repo1", number: 1, title: "PR", branch: "feature" })
      .mockResolvedValueOnce({ owner: "owner", name: "repo", default_branch: "main" });

    mockCreateGitHubPR.mockResolvedValueOnce({ number: 10, url: "https://github.com/owner/repo/pull/10" });

    const runner = createSplitExecutionRunner({ planId: "plan1" });
    const ctx = createTestContext();
    const result = await runner(ctx);

    expect(result.result?.createdPRs).toHaveLength(1);
  });

  it("aborts during sub-PR creation", async () => {
    const subPRs = [
      { index: 1, total: 1, title: "Sub PR", files: [], dependsOn: [], description: "desc", checklist: [] },
    ];

    mockQueryOne
      .mockResolvedValueOnce({
        id: "plan1",
        pr_id: "repo1#1",
        total_lines: 100,
        sub_prs: JSON.stringify(subPRs),
      })
      .mockResolvedValueOnce({ repo_id: "repo1", number: 1, title: "PR", branch: "feature" })
      .mockResolvedValueOnce({ owner: "owner", name: "repo", default_branch: "main" });

    const controller = new AbortController();
    controller.abort();

    const runner = createSplitExecutionRunner({ planId: "plan1" });
    const ctx = createTestContext({ signal: controller.signal });

    await expect(runner(ctx)).rejects.toThrow("Aborted");
  });

  it("updates repo local_path after clone", async () => {
    const subPRs = [
      { index: 1, total: 1, title: "Sub PR", files: [], dependsOn: [], description: "desc", checklist: [] },
    ];

    mockQueryOne
      .mockResolvedValueOnce({
        id: "plan1",
        pr_id: "repo1#1",
        total_lines: 100,
        sub_prs: JSON.stringify(subPRs),
      })
      .mockResolvedValueOnce({ repo_id: "repo1", number: 1, title: "PR", branch: "feature" })
      .mockResolvedValueOnce({ owner: "owner", name: "repo", default_branch: "main" });

    mockCreateGitHubPR.mockResolvedValueOnce({ number: 10, url: "https://github.com/owner/repo/pull/10" });

    const runner = createSplitExecutionRunner({ planId: "plan1" });
    const ctx = createTestContext();
    await runner(ctx);

    expect(mockExecute).toHaveBeenCalledWith(expect.anything(), "UPDATE repos SET local_path = ? WHERE id = ?", [
      "/tmp/repos/owner/repo",
      "repo1",
    ]);
  });

  it("reports progress through all phases", async () => {
    const subPRs = [
      { index: 1, total: 1, title: "Sub PR", files: [], dependsOn: [], description: "desc", checklist: [] },
    ];

    mockQueryOne
      .mockResolvedValueOnce({
        id: "plan1",
        pr_id: "repo1#1",
        total_lines: 100,
        sub_prs: JSON.stringify(subPRs),
      })
      .mockResolvedValueOnce({ repo_id: "repo1", number: 1, title: "PR", branch: "feature" })
      .mockResolvedValueOnce({ owner: "owner", name: "repo", default_branch: "main" });

    mockCreateGitHubPR.mockResolvedValueOnce({ number: 10, url: "https://github.com/owner/repo/pull/10" });

    const runner = createSplitExecutionRunner({ planId: "plan1" });
    const ctx = createTestContext();
    await runner(ctx);

    const phases = ctx.onProgress.mock.calls.map((c: unknown[]) => (c[0] as { phase?: string }).phase).filter(Boolean);
    expect(phases).toContain("Loading plan");
    expect(phases).toContain("Cloning repo");
    expect(phases).toContain("Creating sub-PR 1/1");
    expect(phases).toContain("Complete");
  });
});
