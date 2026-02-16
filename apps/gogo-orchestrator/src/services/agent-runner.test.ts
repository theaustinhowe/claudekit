import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock dependencies
vi.mock("../db/index.js", () => ({
  getConn: vi.fn(() => ({})),
}));

vi.mock("../db/helpers.js", () => ({
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
  ensureBaseClone: vi.fn().mockResolvedValue(undefined),
  fetchUpdates: vi.fn().mockResolvedValue(undefined),
  createWorktree: vi.fn().mockResolvedValue({
    worktreePath: "/tmp/worktrees/issue-42",
    branch: "agent/issue-42",
  }),
}));

vi.mock("./settings-helper.js", () => ({
  validateWorkspaceSettings: vi.fn(),
  getWorkspaceSettings: vi.fn(),
  toGitConfig: vi.fn(),
  toGitConfigFromRepo: vi.fn().mockReturnValue({
    workdir: "/tmp/repos",
    owner: "testowner",
    name: "testrepo",
    token: "ghp_test",
    repoUrl: "https://github.com/testowner/testrepo",
    baseBranch: "main",
  }),
}));

import { execute, queryOne } from "../db/helpers.js";
import { broadcast } from "../ws/handler.js";
import { isRunning, startJobRun, stopJobRun } from "./agent-runner.js";
import {
  getWorkspaceSettings,
  toGitConfig,
  validateWorkspaceSettings,
} from "./settings-helper.js";

const makeJob = (overrides?: Partial<Record<string, unknown>>) => ({
  id: "job-1",
  status: "queued",
  repository_id: "repo-1",
  issue_number: 42,
  issue_title: "Fix the bug",
  worktree_path: null,
  branch: null,
  ...overrides,
});

describe("agent-runner", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("startJobRun", () => {
    it("should reject if the job is already running in this process", async () => {
      // First, successfully start a job
      const claimedJob = makeJob({ status: "running" });

      // execute for atomic UPDATE
      vi.mocked(execute).mockResolvedValue(undefined);
      // queryOne for claimed check, then repo lookup
      vi.mocked(queryOne)
        .mockResolvedValueOnce(claimedJob) // claimed job check
        .mockResolvedValueOnce({
          id: "repo-1",
          is_active: true,
          owner: "testowner",
          name: "testrepo",
          github_token: "ghp_test",
          workdir_path: "/tmp/repos",
          base_branch: "main",
        }); // repo lookup

      const result1 = await startJobRun("job-1");
      expect(result1.success).toBe(true);

      // Second call with same jobId should fail
      const result2 = await startJobRun("job-1");
      expect(result2.success).toBe(false);
      expect(result2.error).toBe("Job run already in progress");
    });

    it("should return error when job is not found", async () => {
      vi.mocked(execute).mockResolvedValue(undefined);
      // queryOne returns undefined for claimed check, then undefined for job lookup
      vi.mocked(queryOne)
        .mockResolvedValueOnce(undefined) // claimed job not found
        .mockResolvedValueOnce(undefined); // job lookup not found

      const result = await startJobRun("nonexistent");
      expect(result.success).toBe(false);
      expect(result.error).toBe("Job not found");
    });

    it("should return error when job is not in queued state", async () => {
      const runningJob = makeJob({ status: "running" });
      vi.mocked(execute).mockResolvedValue(undefined);
      // queryOne returns undefined for claimed check (can't claim - not queued), then finds running job
      vi.mocked(queryOne)
        .mockResolvedValueOnce(undefined) // claimed check fails
        .mockResolvedValueOnce(runningJob); // job exists but running

      const result = await startJobRun("job-1");
      expect(result.success).toBe(false);
      expect(result.error).toContain("must be in 'queued' state");
    });

    it("should atomically claim the job and transition to running", async () => {
      const claimedJob = makeJob({ status: "running" });

      vi.mocked(execute).mockResolvedValue(undefined);
      vi.mocked(queryOne)
        .mockResolvedValueOnce(claimedJob) // claimed job
        .mockResolvedValueOnce({
          id: "repo-1",
          is_active: true,
          owner: "testowner",
          name: "testrepo",
          github_token: "ghp_test",
          workdir_path: "/tmp/repos",
          base_branch: "main",
        }); // repo lookup

      const result = await startJobRun("job-1");

      expect(result.success).toBe(true);
      expect(broadcast).toHaveBeenCalledWith({
        type: "job:updated",
        payload: claimedJob,
      });
    });

    it("should revert to failed when repository is not found", async () => {
      const claimedJob = makeJob({ status: "running" });

      vi.mocked(execute).mockResolvedValue(undefined);
      vi.mocked(queryOne)
        .mockResolvedValueOnce(claimedJob) // claimed job
        .mockResolvedValueOnce(undefined) // repo not found
        .mockResolvedValueOnce(undefined); // failedJob lookup in revert

      const result = await startJobRun("job-1");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Repository not found");
    });

    it("should revert to failed when repository is inactive", async () => {
      const claimedJob = makeJob({ status: "running" });

      vi.mocked(execute).mockResolvedValue(undefined);
      vi.mocked(queryOne)
        .mockResolvedValueOnce(claimedJob) // claimed job
        .mockResolvedValueOnce({ id: "repo-1", is_active: false }); // inactive repo

      const result = await startJobRun("job-1");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Repository is not active");
    });

    it("should fall back to legacy workspace settings when no repositoryId", async () => {
      const claimedJob = makeJob({ status: "running", repository_id: null });

      vi.mocked(execute).mockResolvedValue(undefined);
      vi.mocked(queryOne).mockResolvedValueOnce(claimedJob);

      vi.mocked(validateWorkspaceSettings).mockResolvedValue({
        valid: true,
        errors: [],
      });
      vi.mocked(getWorkspaceSettings).mockResolvedValue({
        workdir: "/tmp/repos",
        owner: "testowner",
        name: "testrepo",
        token: "ghp_test",
        repoUrl: "https://github.com/testowner/testrepo",
      });
      vi.mocked(toGitConfig).mockReturnValue({
        workdir: "/tmp/repos",
        owner: "testowner",
        name: "testrepo",
        token: "ghp_test",
        repoUrl: "https://github.com/testowner/testrepo",
        baseBranch: "main",
      });

      const result = await startJobRun("job-1");

      expect(result.success).toBe(true);
      expect(validateWorkspaceSettings).toHaveBeenCalled();
    });

    it("should revert to failed when workspace settings are invalid", async () => {
      const claimedJob = makeJob({ status: "running", repository_id: null });

      vi.mocked(execute).mockResolvedValue(undefined);
      vi.mocked(queryOne)
        .mockResolvedValueOnce(claimedJob) // claimed job
        .mockResolvedValueOnce(undefined); // failedJob lookup

      vi.mocked(validateWorkspaceSettings).mockResolvedValue({
        valid: false,
        errors: ["GitHub token not set"],
      });

      const result = await startJobRun("job-1");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Workspace settings invalid");
    });
  });

  describe("stopJobRun", () => {
    it("should return false if no active run exists", () => {
      const result = stopJobRun("nonexistent-job");
      expect(result).toBe(false);
    });

    it("should set cancellation flag and return true for active runs", async () => {
      // Start a job first
      const claimedJob = makeJob({ id: "stop-test-job", status: "running" });

      vi.mocked(execute).mockResolvedValue(undefined);
      vi.mocked(queryOne)
        .mockResolvedValueOnce(claimedJob)
        .mockResolvedValueOnce({
          id: "repo-1",
          is_active: true,
          owner: "testowner",
          name: "testrepo",
          github_token: "ghp_test",
          workdir_path: "/tmp/repos",
          base_branch: "main",
        });

      await startJobRun("stop-test-job");
      expect(isRunning("stop-test-job")).toBe(true);

      const result = stopJobRun("stop-test-job");
      expect(result).toBe(true);
      expect(isRunning("stop-test-job")).toBe(false);
    });
  });

  describe("isRunning", () => {
    it("should return false for unknown jobs", () => {
      expect(isRunning("unknown")).toBe(false);
    });
  });
});
