import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock dependencies
vi.mock("../db/index.js", () => ({
  getDb: vi.fn(async () => ({})),
}));

vi.mock("@devkit/duckdb", () => ({
  queryAll: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
  withTransaction: vi.fn(),
  buildUpdate: vi.fn(),
  buildWhere: vi.fn(),
  buildInClause: vi.fn(),
  checkpoint: vi.fn(),
}));

vi.mock("../ws/handler.js", () => ({
  broadcast: vi.fn(),
  sendLogToSubscribers: vi.fn(),
}));

vi.mock("./git.js", () => ({
  isWorkingTreeClean: vi.fn(),
  commitAllChanges: vi.fn(),
  pushBranch: vi.fn(),
  hasCommits: vi.fn(),
  getCommitLog: vi.fn(),
}));

vi.mock("./github/index.js", () => ({
  findExistingPrForRepo: vi.fn(),
  createPullRequestForRepo: vi.fn(),
  createIssueCommentForRepo: vi.fn(),
  AGENT_COMMENT_MARKER: "<!-- gogo:output -->",
}));

vi.mock("./pr-reviewing.js", () => ({
  enterPrReviewing: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./settings-helper.js", () => ({
  toGitConfigFromRepo: vi.fn().mockReturnValue({
    workdir: "/tmp/repos",
    owner: "testowner",
    name: "testrepo",
    token: "ghp_test",
    repoUrl: "https://github.com/testowner/testrepo",
    baseBranch: "main",
  }),
}));

vi.mock("./state-machine.js", () => ({
  applyTransitionAtomic: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("./test-runner.js", () => ({
  runTests: vi.fn(),
  getTestCommands: vi.fn().mockResolvedValue(["npm test"]),
  getMaxTestRetries: vi.fn().mockResolvedValue(3),
}));

vi.mock("../utils/job-logging.js", () => ({
  emitLog: vi.fn().mockResolvedValue(undefined),
}));

import { execute, queryAll, queryOne } from "@devkit/duckdb";
import { commitAllChanges, getCommitLog, hasCommits, isWorkingTreeClean, pushBranch } from "./git.js";
import { createIssueCommentForRepo, createPullRequestForRepo, findExistingPrForRepo } from "./github/index.js";
import { pollReadyToPrJobs, processReadyToPr } from "./pr-flow.js";
import { applyTransitionAtomic } from "./state-machine.js";
import { getMaxTestRetries, runTests } from "./test-runner.js";

const makeJob = (overrides?: Partial<Record<string, unknown>>) => ({
  id: "job-1",
  status: "ready_to_pr",
  repository_id: "repo-1",
  issue_number: 42,
  issue_title: "Fix the bug",
  worktree_path: "/tmp/worktrees/issue-42",
  branch: "agent/issue-42",
  test_retry_count: 0,
  pr_number: null,
  ...overrides,
});

const makeRepo = (overrides?: Partial<Record<string, unknown>>) => ({
  id: "repo-1",
  owner: "testowner",
  name: "testrepo",
  base_branch: "main",
  github_token: "ghp_test",
  workdir_path: "/tmp/repos",
  test_command: null,
  is_active: true,
  auto_create_pr: true,
  ...overrides,
});

describe("pr-flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Re-set mocks that must survive clearing
    vi.mocked(runTests).mockResolvedValue({
      success: true,
      output: "passed",
      exitCode: 0,
      commandsRun: ["npm test"],
    });
    vi.mocked(getMaxTestRetries).mockResolvedValue(3);

    // Default execute mock
    vi.mocked(execute).mockResolvedValue(undefined);
  });

  describe("processReadyToPr", () => {
    it("should return error when job is not found", async () => {
      vi.mocked(queryOne).mockResolvedValueOnce(undefined);

      const result = await processReadyToPr("nonexistent");
      expect(result.success).toBe(false);
      expect(result.error).toBe("Job not found");
    });

    it("should return error when job is not in ready_to_pr state", async () => {
      vi.mocked(queryOne).mockResolvedValueOnce(makeJob({ status: "running" }));

      const result = await processReadyToPr("job-1");
      expect(result.success).toBe(false);
      expect(result.error).toContain("must be in 'ready_to_pr' state");
    });

    it("should return error when job has no worktree path", async () => {
      vi.mocked(queryOne).mockResolvedValueOnce(makeJob({ worktree_path: null }));

      const result = await processReadyToPr("job-1");
      expect(result.success).toBe(false);
      expect(result.error).toContain("does not have a worktree path");
    });

    it("should return error when job has no branch", async () => {
      vi.mocked(queryOne).mockResolvedValueOnce(makeJob({ branch: null }));

      const result = await processReadyToPr("job-1");
      expect(result.success).toBe(false);
      expect(result.error).toContain("does not have a branch");
    });

    it("should return error when repository is not found", async () => {
      const job = makeJob();

      // Job found, repo not found
      vi.mocked(queryOne)
        .mockResolvedValueOnce(job) // job lookup
        .mockResolvedValueOnce(undefined); // repo lookup returns nothing

      const result = await processReadyToPr("job-1");
      expect(result.success).toBe(false);
      expect(result.error).toBe("Repository not found");
    });

    it("should retry tests when they fail and retries remain", async () => {
      const job = makeJob({ test_retry_count: 0 });
      const repo = makeRepo();

      vi.mocked(queryOne)
        .mockResolvedValueOnce(job) // job lookup
        .mockResolvedValueOnce(repo) // repo lookup
        .mockResolvedValueOnce(undefined); // getNextLogSequence (no existing logs)

      vi.mocked(runTests).mockResolvedValue({
        success: false,
        output: "FAIL: Test suite failed",
        exitCode: 1,
        commandsRun: ["npm test"],
      });

      const result = await processReadyToPr("job-1");

      expect(result.success).toBe(false);
      expect(result.retriedToRunning).toBe(true);
      expect(applyTransitionAtomic).toHaveBeenCalledWith(
        "job-1",
        "running",
        "Test failure - agent to fix",
        expect.objectContaining({ test_retry_count: 1 }),
      );
    });

    it("should fail job when max test retries reached", async () => {
      const job = makeJob({ test_retry_count: 2 }); // 2 already, max is 3
      const repo = makeRepo();

      vi.mocked(queryOne)
        .mockResolvedValueOnce(job) // job lookup
        .mockResolvedValueOnce(repo) // repo lookup
        .mockResolvedValueOnce(undefined); // getNextLogSequence

      vi.mocked(runTests).mockResolvedValue({
        success: false,
        output: "FAIL",
        exitCode: 1,
        commandsRun: ["npm test"],
      });

      const result = await processReadyToPr("job-1");

      expect(result.success).toBe(false);
      expect(result.retriedToRunning).toBeUndefined();
      expect(result.error).toContain("Tests failed after 3 attempts");
      expect(applyTransitionAtomic).toHaveBeenCalledWith(
        "job-1",
        "failed",
        expect.stringContaining("Tests failed after 3 attempts"),
        expect.objectContaining({ test_retry_count: 3 }),
      );
    });

    it("should detect and link to existing PR", async () => {
      const job = makeJob();
      const repo = makeRepo();

      vi.mocked(queryOne)
        .mockResolvedValueOnce(job) // job lookup
        .mockResolvedValueOnce(repo) // repo lookup
        .mockResolvedValueOnce(undefined); // getNextLogSequence

      vi.mocked(runTests).mockResolvedValue({
        success: true,
        output: "All tests passed",
        exitCode: 0,
        commandsRun: ["npm test"],
      });

      vi.mocked(findExistingPrForRepo).mockResolvedValue({
        number: 99,
        html_url: "https://github.com/testowner/testrepo/pull/99",
      });

      const result = await processReadyToPr("job-1");

      expect(result.success).toBe(true);
      expect(result.prNumber).toBe(99);
      expect(result.prUrl).toBe("https://github.com/testowner/testrepo/pull/99");
      // Should transition to pr_opened with existing PR
      expect(applyTransitionAtomic).toHaveBeenCalledWith(
        "job-1",
        "pr_opened",
        expect.stringContaining("Linked to existing PR #99"),
        expect.objectContaining({ pr_number: 99 }),
      );
      // Should NOT call createPullRequestForRepo
      expect(createPullRequestForRepo).not.toHaveBeenCalled();
    });

    it("should auto-commit, push, and create PR for clean flow", async () => {
      const job = makeJob();
      const repo = makeRepo();

      vi.mocked(queryOne)
        .mockResolvedValueOnce(job) // job lookup
        .mockResolvedValueOnce(repo) // repo lookup
        .mockResolvedValueOnce(undefined); // getNextLogSequence

      vi.mocked(runTests).mockResolvedValue({
        success: true,
        output: "All passed",
        exitCode: 0,
        commandsRun: ["npm test"],
      });
      vi.mocked(findExistingPrForRepo).mockResolvedValue(null);
      vi.mocked(isWorkingTreeClean).mockResolvedValue(true);
      vi.mocked(hasCommits).mockResolvedValue(true);
      vi.mocked(getCommitLog).mockResolvedValue("abc123 Fix the bug\ndef456 Add tests");
      // updateJob: queryOne for broadcast
      vi.mocked(queryOne).mockResolvedValueOnce(job);
      vi.mocked(pushBranch).mockResolvedValue(undefined);
      vi.mocked(createPullRequestForRepo).mockResolvedValue({
        number: 100,
        html_url: "https://github.com/testowner/testrepo/pull/100",
      } as never);
      vi.mocked(createIssueCommentForRepo).mockResolvedValue({
        id: 1,
      } as never);

      const result = await processReadyToPr("job-1");

      expect(result.success).toBe(true);
      expect(result.prNumber).toBe(100);
      expect(pushBranch).toHaveBeenCalled();
      expect(createPullRequestForRepo).toHaveBeenCalledWith(
        "repo-1",
        expect.objectContaining({
          head: "agent/issue-42",
          base: "main",
          title: "Fix the bug",
        }),
      );
      expect(createIssueCommentForRepo).toHaveBeenCalledWith("repo-1", 42, expect.stringContaining("PR Created"));
    });

    it("should auto-commit when working tree is dirty", async () => {
      const job = makeJob();
      const repo = makeRepo();

      vi.mocked(queryOne)
        .mockResolvedValueOnce(job) // job lookup
        .mockResolvedValueOnce(repo) // repo lookup
        .mockResolvedValueOnce(undefined); // getNextLogSequence

      vi.mocked(runTests).mockResolvedValue({
        success: true,
        output: "passed",
        exitCode: 0,
        commandsRun: ["npm test"],
      });
      vi.mocked(findExistingPrForRepo).mockResolvedValue(null);
      vi.mocked(isWorkingTreeClean).mockResolvedValue(false); // Dirty
      vi.mocked(commitAllChanges).mockResolvedValue(undefined);
      vi.mocked(getCommitLog).mockResolvedValue("commit log");
      // updateJob: queryOne for broadcast
      vi.mocked(queryOne).mockResolvedValueOnce(job);
      vi.mocked(pushBranch).mockResolvedValue(undefined);
      vi.mocked(createPullRequestForRepo).mockResolvedValue({
        number: 101,
        html_url: "https://github.com/testowner/testrepo/pull/101",
      } as never);
      vi.mocked(createIssueCommentForRepo).mockResolvedValue({
        id: 1,
      } as never);

      const result = await processReadyToPr("job-1");

      expect(result.success).toBe(true);
      expect(commitAllChanges).toHaveBeenCalledWith("/tmp/worktrees/issue-42", expect.stringContaining("auto-commit"));
      // Since we auto-committed, hasCommits should NOT be called
      expect(hasCommits).not.toHaveBeenCalled();
    });

    it("should fail when no commits exist on clean tree", async () => {
      const job = makeJob();
      const repo = makeRepo();

      vi.mocked(queryOne)
        .mockResolvedValueOnce(job) // job lookup
        .mockResolvedValueOnce(repo) // repo lookup
        .mockResolvedValueOnce(undefined); // getNextLogSequence

      vi.mocked(runTests).mockResolvedValue({
        success: true,
        output: "passed",
        exitCode: 0,
        commandsRun: ["npm test"],
      });
      vi.mocked(findExistingPrForRepo).mockResolvedValue(null);
      vi.mocked(isWorkingTreeClean).mockResolvedValue(true);
      vi.mocked(hasCommits).mockResolvedValue(false); // No commits!

      const result = await processReadyToPr("job-1");

      expect(result.success).toBe(false);
      expect(result.error).toContain("No commits found");
      expect(applyTransitionAtomic).toHaveBeenCalledWith(
        "job-1",
        "failed",
        expect.stringContaining("No commits found"),
        expect.objectContaining({
          failure_reason: expect.stringContaining("no commits were made"),
        }),
      );
    });

    it("should return error when push fails", async () => {
      const job = makeJob();
      const repo = makeRepo();

      vi.mocked(queryOne)
        .mockResolvedValueOnce(job) // job lookup
        .mockResolvedValueOnce(repo) // repo lookup
        .mockResolvedValueOnce(undefined); // getNextLogSequence

      vi.mocked(runTests).mockResolvedValue({
        success: true,
        output: "passed",
        exitCode: 0,
        commandsRun: ["npm test"],
      });
      vi.mocked(findExistingPrForRepo).mockResolvedValue(null);
      vi.mocked(isWorkingTreeClean).mockResolvedValue(true);
      vi.mocked(hasCommits).mockResolvedValue(true);
      vi.mocked(getCommitLog).mockResolvedValue("commit");
      // updateJob: queryOne for broadcast
      vi.mocked(queryOne).mockResolvedValueOnce(job);
      vi.mocked(pushBranch).mockRejectedValue(new Error("Authentication failed"));

      const result = await processReadyToPr("job-1");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Failed to push branch");
    });
  });

  describe("pollReadyToPrJobs", () => {
    it("should return immediately when no repos have autoCreatePr enabled", async () => {
      vi.mocked(queryAll).mockResolvedValueOnce([]); // No auto-PR repos

      await pollReadyToPrJobs();

      // Should not have queried for jobs
      expect(queryAll).toHaveBeenCalledTimes(1);
    });

    it("should process eligible jobs", async () => {
      const repo = makeRepo();
      const job = makeJob();

      // queryAll calls:
      // 1. autoCreatePrRepos
      // 2. readyJobs
      vi.mocked(queryAll)
        .mockResolvedValueOnce([{ id: "repo-1" }])
        .mockResolvedValueOnce([job]);

      // processReadyToPr inner queryOne calls:
      // 1. job lookup
      // 2. repo lookup
      // 3. getNextLogSequence
      vi.mocked(queryOne)
        .mockResolvedValueOnce(job) // job lookup
        .mockResolvedValueOnce(repo) // repo lookup
        .mockResolvedValueOnce(undefined); // getNextLogSequence

      vi.mocked(runTests).mockResolvedValue({
        success: true,
        output: "passed",
        exitCode: 0,
        commandsRun: [],
      });
      vi.mocked(findExistingPrForRepo).mockResolvedValue(null);
      vi.mocked(isWorkingTreeClean).mockResolvedValue(true);
      vi.mocked(hasCommits).mockResolvedValue(true);
      vi.mocked(getCommitLog).mockResolvedValue("commit");
      // updateJob: queryOne for broadcast
      vi.mocked(queryOne).mockResolvedValueOnce(job);
      vi.mocked(pushBranch).mockResolvedValue(undefined);
      vi.mocked(createPullRequestForRepo).mockResolvedValue({
        number: 1,
        html_url: "https://github.com/test/test/pull/1",
      } as never);
      vi.mocked(createIssueCommentForRepo).mockResolvedValue({
        id: 1,
      } as never);

      await pollReadyToPrJobs();

      expect(createPullRequestForRepo).toHaveBeenCalled();
    });
  });
});
