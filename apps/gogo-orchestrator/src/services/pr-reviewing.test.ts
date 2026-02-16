import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => ({
  rm: vi.fn(),
}));

vi.mock("@devkit/duckdb", () => ({
  execute: vi.fn(),
  queryAll: vi.fn(),
  queryOne: vi.fn(),
}));

vi.mock("../db/index.js", () => ({
  getDb: vi.fn().mockResolvedValue({}),
}));

vi.mock("../utils/logger.js", () => ({
  createServiceLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock("../ws/handler.js", () => ({
  broadcast: vi.fn(),
}));

vi.mock("./agent-executor.js", () => ({
  resumeAgent: vi.fn(),
}));

vi.mock("./git.js", () => ({
  getRepoDir: vi.fn(),
  removeWorktree: vi.fn(),
}));

vi.mock("./github/index.js", () => ({
  getPullRequestByNumber: vi.fn(),
  getPullRequestIssueComments: vi.fn(),
  getPullRequestReviewComments: vi.fn(),
  isHumanComment: vi.fn((c) => !c.user?.login?.includes("bot")),
  isHumanReviewComment: vi.fn((c) => !c.user?.login?.includes("bot")),
}));

vi.mock("./settings-helper.js", () => ({
  toGitConfigFromRepo: vi.fn().mockReturnValue({ owner: "test", name: "repo" }),
}));

vi.mock("./state-machine.js", () => ({
  applyTransitionAtomic: vi.fn(),
}));

import { execute, queryAll, queryOne } from "@devkit/duckdb";
import { getDb } from "../db/index.js";
import { broadcast } from "../ws/handler.js";
import { resumeAgent } from "./agent-executor.js";
import { getPullRequestByNumber, getPullRequestIssueComments, getPullRequestReviewComments } from "./github/index.js";
import { enterPrReviewing, pollPrReviewingJobs } from "./pr-reviewing";
import { applyTransitionAtomic } from "./state-machine.js";

describe("enterPrReviewing", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Restore getDb mock cleared by resetAllMocks
    vi.mocked(getDb).mockResolvedValue({} as never);
  });

  it("throws when job not found", async () => {
    vi.mocked(queryOne).mockResolvedValue(undefined);
    await expect(enterPrReviewing("nonexistent")).rejects.toThrow("not found");
  });

  it("throws when job is not in pr_opened state", async () => {
    vi.mocked(queryOne).mockResolvedValue({ id: "job-1", status: "running" });
    await expect(enterPrReviewing("job-1")).rejects.toThrow("pr_opened");
  });

  it("throws when transition fails", async () => {
    vi.mocked(queryOne).mockResolvedValue({ id: "job-1", status: "pr_opened" });
    vi.mocked(applyTransitionAtomic).mockResolvedValue({ success: false, error: "transition error" });
    await expect(enterPrReviewing("job-1")).rejects.toThrow("transition error");
  });

  it("succeeds when job is in pr_opened state", async () => {
    vi.mocked(queryOne).mockResolvedValue({ id: "job-1", status: "pr_opened" });
    vi.mocked(applyTransitionAtomic).mockResolvedValue({ success: true });

    await expect(enterPrReviewing("job-1")).resolves.toBeUndefined();
    expect(applyTransitionAtomic).toHaveBeenCalledWith("job-1", "pr_reviewing", expect.any(String), expect.any(Object));
  });
});

describe("pollPrReviewingJobs", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getDb).mockResolvedValue({} as never);
  });

  it("returns early when no pr_reviewing jobs exist", async () => {
    vi.mocked(queryAll).mockResolvedValue([]);
    await pollPrReviewingJobs();
    expect(getPullRequestByNumber).not.toHaveBeenCalled();
  });

  it("isolates errors per job", async () => {
    vi.mocked(queryAll).mockResolvedValue([
      { id: "job-1", pr_number: 1, repository_id: "repo-1", status: "pr_reviewing" },
      { id: "job-2", pr_number: 2, repository_id: "repo-1", status: "pr_reviewing" },
    ]);

    // First job throws, second job succeeds
    vi.mocked(getPullRequestByNumber)
      .mockRejectedValueOnce(new Error("API error"))
      .mockResolvedValueOnce({ state: "open", merged: false } as never);

    // Set up for second job's review check
    vi.mocked(getPullRequestReviewComments).mockResolvedValue([]);
    vi.mocked(getPullRequestIssueComments).mockResolvedValue([]);

    // Should not throw — errors are isolated per job
    await expect(pollPrReviewingJobs()).resolves.toBeUndefined();
  });

  it("skips jobs without pr_number", async () => {
    vi.mocked(queryAll).mockResolvedValue([
      { id: "job-1", pr_number: null, repository_id: "repo-1", status: "pr_reviewing" },
    ]);
    await pollPrReviewingJobs();
    expect(getPullRequestByNumber).not.toHaveBeenCalled();
  });

  it("skips jobs without repository_id", async () => {
    vi.mocked(queryAll).mockResolvedValue([{ id: "job-1", pr_number: 1, repository_id: null, status: "pr_reviewing" }]);
    await pollPrReviewingJobs();
    expect(getPullRequestByNumber).not.toHaveBeenCalled();
  });

  it("transitions to done when PR is merged", async () => {
    vi.mocked(queryAll).mockResolvedValue([
      { id: "job-1", pr_number: 42, repository_id: "repo-1", status: "pr_reviewing", worktree_path: null },
    ]);
    vi.mocked(getPullRequestByNumber).mockResolvedValue({
      state: "closed",
      merged: true,
      merged_at: "2026-02-16T12:00:00Z",
    } as never);
    vi.mocked(applyTransitionAtomic).mockResolvedValue({ success: true });

    await pollPrReviewingJobs();

    expect(execute).toHaveBeenCalled(); // Insert job event
    expect(applyTransitionAtomic).toHaveBeenCalledWith("job-1", "done", expect.stringContaining("merged"));
  });

  it("transitions to paused when PR is closed without merge", async () => {
    vi.mocked(queryAll).mockResolvedValue([
      { id: "job-1", pr_number: 42, repository_id: "repo-1", status: "pr_reviewing" },
    ]);
    vi.mocked(getPullRequestByNumber).mockResolvedValue({
      state: "closed",
      merged: false,
    } as never);
    vi.mocked(applyTransitionAtomic).mockResolvedValue({ success: true });

    await pollPrReviewingJobs();

    expect(applyTransitionAtomic).toHaveBeenCalledWith(
      "job-1",
      "paused",
      expect.stringContaining("closed"),
      expect.objectContaining({ pause_reason: expect.any(String) }),
    );
  });

  it("checks for review feedback when PR is open", async () => {
    vi.mocked(queryAll).mockResolvedValue([
      {
        id: "job-1",
        pr_number: 42,
        repository_id: "repo-1",
        status: "pr_reviewing",
        last_checked_comment_id: null,
        last_checked_pr_review_comment_id: null,
        claude_session_id: "session-1",
        agent_type: "claude-code",
      },
    ]);
    vi.mocked(getPullRequestByNumber).mockResolvedValue({ state: "open", merged: false } as never);
    vi.mocked(getPullRequestReviewComments).mockResolvedValue([
      { id: 100, body: "Please fix this", user: { login: "reviewer" }, path: "src/index.ts", line: 10 },
    ] as never);
    vi.mocked(getPullRequestIssueComments).mockResolvedValue([]);
    vi.mocked(applyTransitionAtomic).mockResolvedValue({ success: true });
    vi.mocked(queryOne).mockResolvedValue({ id: "job-1", status: "running" });
    vi.mocked(resumeAgent).mockResolvedValue({ success: true });

    await pollPrReviewingJobs();

    expect(applyTransitionAtomic).toHaveBeenCalledWith("job-1", "running", expect.any(String));
    expect(resumeAgent).toHaveBeenCalledWith("job-1", expect.stringContaining("Review Feedback"), "claude-code");
    expect(broadcast).toHaveBeenCalled();
  });

  it("skips when no human comments found", async () => {
    vi.mocked(queryAll).mockResolvedValue([
      {
        id: "job-1",
        pr_number: 42,
        repository_id: "repo-1",
        status: "pr_reviewing",
        last_checked_comment_id: null,
        last_checked_pr_review_comment_id: null,
      },
    ]);
    vi.mocked(getPullRequestByNumber).mockResolvedValue({ state: "open", merged: false } as never);
    vi.mocked(getPullRequestReviewComments).mockResolvedValue([]);
    vi.mocked(getPullRequestIssueComments).mockResolvedValue([]);

    await pollPrReviewingJobs();

    expect(applyTransitionAtomic).not.toHaveBeenCalled();
    expect(resumeAgent).not.toHaveBeenCalled();
  });

  it("updates tracking IDs even without human comments", async () => {
    vi.mocked(queryAll).mockResolvedValue([
      {
        id: "job-1",
        pr_number: 42,
        repository_id: "repo-1",
        status: "pr_reviewing",
        last_checked_comment_id: null,
        last_checked_pr_review_comment_id: null,
      },
    ]);
    vi.mocked(getPullRequestByNumber).mockResolvedValue({ state: "open", merged: false } as never);
    // Bot comments (filtered out as non-human by our mock)
    vi.mocked(getPullRequestReviewComments).mockResolvedValue([
      { id: 200, body: "auto check", user: { login: "github-bot" } },
    ] as never);
    vi.mocked(getPullRequestIssueComments).mockResolvedValue([]);

    await pollPrReviewingJobs();

    // Should update tracking IDs
    expect(execute).toHaveBeenCalledWith(
      {},
      expect.stringContaining("last_checked_pr_review_comment_id"),
      expect.arrayContaining([200]),
    );
  });

  it("handles failed transition gracefully", async () => {
    vi.mocked(queryAll).mockResolvedValue([
      {
        id: "job-1",
        pr_number: 42,
        repository_id: "repo-1",
        status: "pr_reviewing",
        last_checked_comment_id: null,
        last_checked_pr_review_comment_id: null,
        claude_session_id: "session-1",
      },
    ]);
    vi.mocked(getPullRequestByNumber).mockResolvedValue({ state: "open", merged: false } as never);
    vi.mocked(getPullRequestReviewComments).mockResolvedValue([
      { id: 100, body: "fix this", user: { login: "human" } },
    ] as never);
    vi.mocked(getPullRequestIssueComments).mockResolvedValue([]);
    vi.mocked(applyTransitionAtomic).mockResolvedValue({ success: false, error: "conflict" });

    await pollPrReviewingJobs();

    // Should not attempt to resume agent when transition fails
    expect(resumeAgent).not.toHaveBeenCalled();
  });

  it("handles job with no session ID for resume", async () => {
    vi.mocked(queryAll).mockResolvedValue([
      {
        id: "job-1",
        pr_number: 42,
        repository_id: "repo-1",
        status: "pr_reviewing",
        last_checked_comment_id: null,
        last_checked_pr_review_comment_id: null,
        claude_session_id: null,
        agent_type: null,
      },
    ]);
    vi.mocked(getPullRequestByNumber).mockResolvedValue({ state: "open", merged: false } as never);
    vi.mocked(getPullRequestReviewComments).mockResolvedValue([
      { id: 100, body: "fix this", user: { login: "human" } },
    ] as never);
    vi.mocked(getPullRequestIssueComments).mockResolvedValue([]);
    vi.mocked(applyTransitionAtomic).mockResolvedValue({ success: true });
    vi.mocked(queryOne).mockResolvedValue({ id: "job-1", status: "running" });

    await pollPrReviewingJobs();

    // Should not call resumeAgent when no session
    expect(resumeAgent).not.toHaveBeenCalled();
  });
});
