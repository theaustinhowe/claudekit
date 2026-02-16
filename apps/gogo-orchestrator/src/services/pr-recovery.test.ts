import { beforeEach, describe, expect, it, vi } from "vitest";

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
}));

vi.mock("./github/index.js", () => ({
  getOpenPullRequestsForRepo: vi.fn(),
  getIssueByNumber: vi.fn(),
}));

vi.mock("./pr-reviewing.js", () => ({
  enterPrReviewing: vi.fn(),
}));

import { execute, queryAll, queryOne } from "@devkit/duckdb";
import { broadcast } from "../ws/handler.js";
import { getIssueByNumber, getOpenPullRequestsForRepo } from "./github/index.js";
import type { GitHubIssue } from "./github/types.js";
import { recoverOrphanedPrs } from "./pr-recovery.js";
import { enterPrReviewing } from "./pr-reviewing.js";

function mockGitHubIssue(overrides: {
  number: number;
  title: string;
  html_url: string;
  body: string | null;
}): GitHubIssue {
  return {
    state: "open",
    labels: [],
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    closed_at: null,
    user: null,
    ...overrides,
  };
}

describe("pr-recovery", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(execute).mockResolvedValue(undefined);
  });

  it("should return zero counts when no active repositories", async () => {
    vi.mocked(queryAll).mockResolvedValue([]);

    const result = await recoverOrphanedPrs();

    expect(result).toEqual({
      repositoriesChecked: 0,
      prsScanned: 0,
      jobsRecovered: 0,
      errors: [],
    });
  });

  it("should skip PRs without agent branch pattern", async () => {
    vi.mocked(queryAll).mockResolvedValue([{ id: "repo-1", owner: "test", name: "repo", is_active: true }]);
    vi.mocked(getOpenPullRequestsForRepo).mockResolvedValue([
      {
        number: 10,
        head_ref: "feature/new-thing",
        html_url: "https://github.com/test/repo/pull/10",
        state: "open" as const,
      },
      { number: 11, head_ref: "fix/bug-123", html_url: "https://github.com/test/repo/pull/11", state: "open" as const },
    ]);

    const result = await recoverOrphanedPrs();

    expect(result.repositoriesChecked).toBe(1);
    expect(result.prsScanned).toBe(2);
    expect(result.jobsRecovered).toBe(0);
  });

  it("should extract issue number from agent/issue-{N}-{slug} branch", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});

    vi.mocked(queryAll).mockResolvedValue([{ id: "repo-1", owner: "test", name: "repo", is_active: true }]);
    vi.mocked(getOpenPullRequestsForRepo).mockResolvedValue([
      {
        number: 20,
        head_ref: "agent/issue-42-fix-bug",
        html_url: "https://github.com/test/repo/pull/20",
        state: "open" as const,
      },
    ]);
    // jobExistsForIssue - no existing job
    vi.mocked(queryOne)
      .mockResolvedValueOnce(undefined) // no existing job
      .mockResolvedValueOnce({ id: "new-job" }); // newly created job

    vi.mocked(getIssueByNumber).mockResolvedValue(
      mockGitHubIssue({
        number: 42,
        title: "Fix the bug",
        html_url: "https://github.com/test/repo/issues/42",
        body: "Bug description",
      }),
    );
    vi.mocked(enterPrReviewing).mockResolvedValue(undefined);

    const result = await recoverOrphanedPrs();

    expect(result.jobsRecovered).toBe(1);
    expect(getIssueByNumber).toHaveBeenCalledWith("repo-1", 42);
  });

  it("should extract issue number from agent/{N}-{slug} branch pattern", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});

    vi.mocked(queryAll).mockResolvedValue([{ id: "repo-1", owner: "test", name: "repo", is_active: true }]);
    vi.mocked(getOpenPullRequestsForRepo).mockResolvedValue([
      {
        number: 30,
        head_ref: "agent/123-slug",
        html_url: "https://github.com/test/repo/pull/30",
        state: "open" as const,
      },
    ]);
    vi.mocked(queryOne)
      .mockResolvedValueOnce(undefined) // no existing job
      .mockResolvedValueOnce({ id: "new-job" }); // newly created job

    vi.mocked(getIssueByNumber).mockResolvedValue(
      mockGitHubIssue({ number: 123, title: "Task", html_url: "https://github.com/test/repo/issues/123", body: "" }),
    );
    vi.mocked(enterPrReviewing).mockResolvedValue(undefined);

    const result = await recoverOrphanedPrs();

    expect(result.jobsRecovered).toBe(1);
    expect(getIssueByNumber).toHaveBeenCalledWith("repo-1", 123);
  });

  it("should skip PRs when job already exists for the issue", async () => {
    vi.mocked(queryAll).mockResolvedValue([{ id: "repo-1", owner: "test", name: "repo", is_active: true }]);
    vi.mocked(getOpenPullRequestsForRepo).mockResolvedValue([
      {
        number: 20,
        head_ref: "agent/issue-42-fix-bug",
        html_url: "https://github.com/test/repo/pull/20",
        state: "open" as const,
      },
    ]);
    vi.mocked(queryOne).mockResolvedValue({ id: "existing-job" }); // job already exists

    const result = await recoverOrphanedPrs();

    expect(result.jobsRecovered).toBe(0);
    expect(getIssueByNumber).not.toHaveBeenCalled();
  });

  it("should record error when issue not found on GitHub", async () => {
    vi.mocked(queryAll).mockResolvedValue([{ id: "repo-1", owner: "test", name: "repo", is_active: true }]);
    vi.mocked(getOpenPullRequestsForRepo).mockResolvedValue([
      {
        number: 20,
        head_ref: "agent/issue-99-missing",
        html_url: "https://github.com/test/repo/pull/20",
        state: "open" as const,
      },
    ]);
    vi.mocked(queryOne).mockResolvedValue(undefined); // no existing job
    vi.mocked(getIssueByNumber).mockResolvedValue(null);

    const result = await recoverOrphanedPrs();

    expect(result.jobsRecovered).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("Could not fetch issue #99");
  });

  it("should create job record with pr_reviewing status", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});

    vi.mocked(queryAll).mockResolvedValue([{ id: "repo-1", owner: "test", name: "repo", is_active: true }]);
    vi.mocked(getOpenPullRequestsForRepo).mockResolvedValue([
      {
        number: 20,
        head_ref: "agent/issue-42-fix",
        html_url: "https://github.com/test/repo/pull/20",
        state: "open" as const,
      },
    ]);
    vi.mocked(queryOne)
      .mockResolvedValueOnce(undefined) // no existing job
      .mockResolvedValueOnce({ id: "recovered-job", status: "pr_reviewing" }); // newly created

    vi.mocked(getIssueByNumber).mockResolvedValue(
      mockGitHubIssue({
        number: 42,
        title: "Fix bug",
        html_url: "https://github.com/test/repo/issues/42",
        body: "Description",
      }),
    );
    vi.mocked(enterPrReviewing).mockResolvedValue(undefined);

    await recoverOrphanedPrs();

    // Verify INSERT with pr_reviewing status
    expect(execute).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("INSERT INTO jobs"),
      expect.arrayContaining(["pr_reviewing"]),
    );
    // Verify audit event
    expect(execute).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("INSERT INTO job_events"),
      expect.arrayContaining([expect.stringContaining("recovered from orphaned PR")]),
    );
    expect(broadcast).toHaveBeenCalledWith({
      type: "job:created",
      payload: expect.objectContaining({ id: "recovered-job" }),
    });
    expect(enterPrReviewing).toHaveBeenCalledWith("recovered-job");
  });

  it("should handle enterPrReviewing failure as non-fatal", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});

    vi.mocked(queryAll).mockResolvedValue([{ id: "repo-1", owner: "test", name: "repo", is_active: true }]);
    vi.mocked(getOpenPullRequestsForRepo).mockResolvedValue([
      {
        number: 20,
        head_ref: "agent/issue-42-fix",
        html_url: "https://github.com/test/repo/pull/20",
        state: "open" as const,
      },
    ]);
    vi.mocked(queryOne).mockResolvedValueOnce(undefined).mockResolvedValueOnce({ id: "job-1", status: "pr_reviewing" });

    vi.mocked(getIssueByNumber).mockResolvedValue(
      mockGitHubIssue({ number: 42, title: "Fix", html_url: "https://github.com/test/repo/issues/42", body: null }),
    );
    vi.mocked(enterPrReviewing).mockRejectedValue(new Error("PR monitoring failed"));

    const result = await recoverOrphanedPrs();

    expect(result.jobsRecovered).toBe(1);
  });

  it("should handle repository-level errors", async () => {
    vi.mocked(queryAll).mockResolvedValue([{ id: "repo-1", owner: "test", name: "repo", is_active: true }]);
    vi.mocked(getOpenPullRequestsForRepo).mockRejectedValue(new Error("API rate limited"));

    const result = await recoverOrphanedPrs();

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("API rate limited");
  });

  it("should record error when job creation fails (queryOne returns null)", async () => {
    vi.mocked(queryAll).mockResolvedValue([{ id: "repo-1", owner: "test", name: "repo", is_active: true }]);
    vi.mocked(getOpenPullRequestsForRepo).mockResolvedValue([
      {
        number: 20,
        head_ref: "agent/issue-42-fix",
        html_url: "https://github.com/test/repo/pull/20",
        state: "open" as const,
      },
    ]);
    vi.mocked(queryOne)
      .mockResolvedValueOnce(undefined) // no existing job
      .mockResolvedValueOnce(null); // INSERT failed

    vi.mocked(getIssueByNumber).mockResolvedValue(
      mockGitHubIssue({ number: 42, title: "Fix", html_url: "https://github.com/test/repo/issues/42", body: null }),
    );

    const result = await recoverOrphanedPrs();

    expect(result.jobsRecovered).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("Failed to create job record");
  });
});
