import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
}));

vi.mock("@claudekit/duckdb", () => ({
  queryAll: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
}));

vi.mock("@/lib/git-operations", () => ({
  cloneOrUpdateRepo: vi.fn(),
  checkoutBranch: vi.fn(),
  commitAndPush: vi.fn(),
  getPAT: vi.fn(),
}));

vi.mock("@claudekit/claude-runner", () => ({
  runClaude: vi.fn(),
}));

vi.mock("@/lib/services/session-manager", () => ({
  setSessionPid: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("node:util", () => ({
  promisify: vi.fn().mockReturnValue(vi.fn().mockResolvedValue({ stdout: "", stderr: "" })),
}));

import { runClaude } from "@claudekit/claude-runner";
import { execute, queryAll, queryOne } from "@claudekit/duckdb";
import { checkoutBranch, cloneOrUpdateRepo, commitAndPush, getPAT } from "@/lib/git-operations";
import { createFixExecutionRunner } from "./fix-execution";

const mockQueryAll = vi.mocked(queryAll);
const mockQueryOne = vi.mocked(queryOne);
const mockExecute = vi.mocked(execute);
const mockRunClaude = vi.mocked(runClaude);
const mockCloneOrUpdateRepo = vi.mocked(cloneOrUpdateRepo);
const mockCheckoutBranch = vi.mocked(checkoutBranch);
const mockCommitAndPush = vi.mocked(commitAndPush);
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

describe("createFixExecutionRunner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPAT.mockReturnValue("ghp_test_token");
    mockCloneOrUpdateRepo.mockResolvedValue("/tmp/repos/owner/repo");
    mockCheckoutBranch.mockResolvedValue(undefined);
  });

  it("runs happy path: clones, applies fixes, commits and pushes", async () => {
    const fixes = [{ id: "f1", comment_id: "c1", suggested_fix: "Add null check", fix_diff: "diff1" }];
    mockQueryAll.mockResolvedValueOnce(fixes);

    // comment -> PR -> repo lookups
    mockQueryOne
      .mockResolvedValueOnce({ pr_id: "repo1#1" }) // first comment's PR
      .mockResolvedValueOnce({ repo_id: "repo1", number: 1, branch: "feature" }) // PR
      .mockResolvedValueOnce({ owner: "owner", name: "repo", default_branch: "main" }) // repo
      .mockResolvedValueOnce({ body: "Fix null check", file_path: "src/utils.ts", line_number: 10 }); // comment details

    mockRunClaude.mockResolvedValue({ stdout: "Applied fix", exitCode: 0, stderr: "" });
    mockCommitAndPush.mockResolvedValue("abc1234567890");

    const runner = createFixExecutionRunner({ fixIds: ["f1"] });
    const ctx = createTestContext();
    const result = await runner(ctx);

    expect(result.result).toEqual({
      results: [{ fixId: "f1", commentId: "c1", status: "pushed", commitSha: "abc1234567890" }],
    });

    expect(mockCloneOrUpdateRepo).toHaveBeenCalledWith("owner", "repo", "ghp_test_token");
    expect(mockCheckoutBranch).toHaveBeenCalledWith("/tmp/repos/owner/repo", "origin/feature");
    expect(mockCommitAndPush).toHaveBeenCalledWith(
      "/tmp/repos/owner/repo",
      "feature",
      expect.stringContaining("fix: address review comment"),
      "ghp_test_token",
      "owner",
      "repo",
    );

    // Verify execution was recorded in DB
    expect(mockExecute).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("INSERT INTO fix_executions"),
      expect.arrayContaining(["f1", "c1", "feature"]),
    );

    // Verify status was updated to pushed
    expect(mockExecute).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("UPDATE fix_executions SET status = 'pushed'"),
      expect.arrayContaining(["abc1234567890"]),
    );
  });

  it("throws when no fixes found", async () => {
    mockQueryAll.mockResolvedValueOnce([]);

    const runner = createFixExecutionRunner({ fixIds: ["f1"] });
    const ctx = createTestContext();

    await expect(runner(ctx)).rejects.toThrow("No fixes found");
  });

  it("throws when comment not found", async () => {
    mockQueryAll.mockResolvedValueOnce([{ id: "f1", comment_id: "c1", suggested_fix: "Fix", fix_diff: "diff" }]);
    mockQueryOne.mockResolvedValueOnce(undefined); // comment not found

    const runner = createFixExecutionRunner({ fixIds: ["f1"] });
    const ctx = createTestContext();

    await expect(runner(ctx)).rejects.toThrow("Comment not found");
  });

  it("throws when PR not found", async () => {
    mockQueryAll.mockResolvedValueOnce([{ id: "f1", comment_id: "c1", suggested_fix: "Fix", fix_diff: "diff" }]);
    mockQueryOne.mockResolvedValueOnce({ pr_id: "repo1#1" }).mockResolvedValueOnce(undefined); // PR not found

    const runner = createFixExecutionRunner({ fixIds: ["f1"] });
    const ctx = createTestContext();

    await expect(runner(ctx)).rejects.toThrow("PR not found");
  });

  it("throws when PR branch is unknown", async () => {
    mockQueryAll.mockResolvedValueOnce([{ id: "f1", comment_id: "c1", suggested_fix: "Fix", fix_diff: "diff" }]);
    mockQueryOne
      .mockResolvedValueOnce({ pr_id: "repo1#1" })
      .mockResolvedValueOnce({ repo_id: "repo1", number: 1, branch: null }); // no branch

    const runner = createFixExecutionRunner({ fixIds: ["f1"] });
    const ctx = createTestContext();

    await expect(runner(ctx)).rejects.toThrow("PR branch unknown");
  });

  it("throws when repo not found", async () => {
    mockQueryAll.mockResolvedValueOnce([{ id: "f1", comment_id: "c1", suggested_fix: "Fix", fix_diff: "diff" }]);
    mockQueryOne
      .mockResolvedValueOnce({ pr_id: "repo1#1" })
      .mockResolvedValueOnce({ repo_id: "repo1", number: 1, branch: "feature" })
      .mockResolvedValueOnce(undefined); // repo not found

    const runner = createFixExecutionRunner({ fixIds: ["f1"] });
    const ctx = createTestContext();

    await expect(runner(ctx)).rejects.toThrow("Repo not found");
  });

  it("continues with remaining fixes when one fails", async () => {
    const fixes = [
      { id: "f1", comment_id: "c1", suggested_fix: "Fix 1", fix_diff: "diff1" },
      { id: "f2", comment_id: "c2", suggested_fix: "Fix 2", fix_diff: "diff2" },
    ];
    mockQueryAll.mockResolvedValueOnce(fixes);

    mockQueryOne
      .mockResolvedValueOnce({ pr_id: "repo1#1" }) // first comment
      .mockResolvedValueOnce({ repo_id: "repo1", number: 1, branch: "feature" }) // PR
      .mockResolvedValueOnce({ owner: "owner", name: "repo", default_branch: "main" }) // repo
      .mockResolvedValueOnce({ body: "Fix 1", file_path: "src/a.ts", line_number: 1 }) // comment for f1
      .mockResolvedValueOnce({ body: "Fix 2", file_path: "src/b.ts", line_number: 2 }); // comment for f2

    // First fix fails
    mockRunClaude
      .mockRejectedValueOnce(new Error("Claude error"))
      .mockResolvedValueOnce({ stdout: "Applied", exitCode: 0, stderr: "" });

    mockCommitAndPush.mockResolvedValue("def5678");

    const runner = createFixExecutionRunner({ fixIds: ["f1", "f2"] });
    const ctx = createTestContext();
    const result = await runner(ctx);

    expect(result.result).toEqual({
      results: [
        { fixId: "f1", commentId: "c1", status: "failed", commitSha: null },
        { fixId: "f2", commentId: "c2", status: "pushed", commitSha: "def5678" },
      ],
    });

    // Verify failed execution was recorded
    expect(mockExecute).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("UPDATE fix_executions SET status = 'failed'"),
      expect.arrayContaining(["Claude error"]),
    );
  });

  it("aborts during fix application", async () => {
    mockQueryAll.mockResolvedValueOnce([{ id: "f1", comment_id: "c1", suggested_fix: "Fix", fix_diff: "diff" }]);

    mockQueryOne
      .mockResolvedValueOnce({ pr_id: "repo1#1" })
      .mockResolvedValueOnce({ repo_id: "repo1", number: 1, branch: "feature" })
      .mockResolvedValueOnce({ owner: "owner", name: "repo", default_branch: "main" });

    const controller = new AbortController();
    controller.abort();

    const runner = createFixExecutionRunner({ fixIds: ["f1"] });
    const ctx = createTestContext({ signal: controller.signal });

    await expect(runner(ctx)).rejects.toThrow("Aborted");
  });

  it("reports progress for each fix", async () => {
    const fixes = [{ id: "f1", comment_id: "c1", suggested_fix: "Fix 1", fix_diff: "diff1" }];
    mockQueryAll.mockResolvedValueOnce(fixes);

    mockQueryOne
      .mockResolvedValueOnce({ pr_id: "repo1#1" })
      .mockResolvedValueOnce({ repo_id: "repo1", number: 1, branch: "feature" })
      .mockResolvedValueOnce({ owner: "owner", name: "repo", default_branch: "main" })
      .mockResolvedValueOnce({ body: "Fix", file_path: "src/a.ts", line_number: 1 });

    mockRunClaude.mockResolvedValue({ stdout: "Applied", exitCode: 0, stderr: "" });
    mockCommitAndPush.mockResolvedValue("abc123");

    const runner = createFixExecutionRunner({ fixIds: ["f1"] });
    const ctx = createTestContext();
    await runner(ctx);

    const phases = ctx.onProgress.mock.calls.map((c: unknown[]) => (c[0] as { phase?: string }).phase).filter(Boolean);
    expect(phases).toContain("Loading fixes");
    expect(phases).toContain("Cloning repo");
    expect(phases).toContain("Checking out branch");
    expect(phases).toContain("Applying fix 1/1");
    expect(phases).toContain("Complete");
  });
});
