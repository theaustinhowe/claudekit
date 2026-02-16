import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock dependencies
vi.mock("../db/index.js", () => ({
  getConn: vi.fn(() => ({})),
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

vi.mock("./agent-executor.js", () => ({
  startAgent: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("./agent-runner.js", () => ({
  startJobRun: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("./agents/index.js", () => ({
  agentRegistry: {
    get: vi.fn().mockReturnValue({ type: "claude-code" }),
    getTypes: vi.fn().mockReturnValue(["claude-code"]),
  },
}));

vi.mock("./claude-code-agent.js", () => ({
  getClaudeAvailabilityError: vi.fn().mockResolvedValue(null),
}));

vi.mock("./settings-helper.js", () => ({
  getClaudeSettings: vi.fn().mockResolvedValue({
    enabled: true,
    max_runtime_ms: 7200000,
    max_parallel_jobs: 3,
    test_command: "npm test",
  }),
}));

vi.mock("../utils/job-logging.js", () => ({
  emitLog: vi.fn().mockResolvedValue(undefined),
}));

import { execute, queryAll, queryOne } from "@devkit/duckdb";
import { startAgent } from "./agent-executor.js";
import { startJobRun } from "./agent-runner.js";
import { pollQueuedJobs } from "./job-auto-start.js";

const makeJob = (overrides?: Partial<Record<string, unknown>>) => ({
  id: "job-1",
  status: "queued",
  repository_id: "repo-1",
  issue_number: 42,
  issue_title: "Fix bug",
  worktree_path: null,
  branch: null,
  claude_session_id: null,
  created_at: new Date("2024-01-15T10:00:00Z").toISOString(),
  ...overrides,
});

describe("job-auto-start", () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    // Re-set mocks that must survive clearing
    const { getClaudeSettings } = await import("./settings-helper.js");
    vi.mocked(getClaudeSettings).mockResolvedValue({
      enabled: true,
      max_runtime_ms: 7200000,
      max_parallel_jobs: 3,
      test_command: "npm test",
    });

    const { getClaudeAvailabilityError } = await import("./claude-code-agent.js");
    vi.mocked(getClaudeAvailabilityError).mockResolvedValue(null);

    const { startJobRun: sjr } = await import("./agent-runner.js");
    vi.mocked(sjr).mockResolvedValue({ success: true });

    const { startAgent: sa } = await import("./agent-executor.js");
    vi.mocked(sa).mockResolvedValue({ success: true });

    const { agentRegistry } = await import("./agents/index.js");
    vi.mocked(agentRegistry.get).mockReturnValue({
      type: "claude-code",
    } as never);
    vi.mocked(agentRegistry.getTypes).mockReturnValue(["claude-code"]);

    // Default execute mock
    vi.mocked(execute).mockResolvedValue(undefined);
  });

  describe("pollQueuedJobs", () => {
    it("should return without starting when at capacity", async () => {
      // getRunningJobCount: COUNT returns 3, max is 3
      vi.mocked(queryOne).mockResolvedValueOnce({ total: BigInt(3) });

      const result = await pollQueuedJobs();

      expect(result.started).toBe(0);
      expect(startJobRun).not.toHaveBeenCalled();
    });

    it("should return when no auto-start repos exist", async () => {
      // getRunningJobCount: 0 running
      vi.mocked(queryOne).mockResolvedValueOnce({ total: BigInt(0) });
      // getAutoStartRepos: empty
      vi.mocked(queryAll).mockResolvedValueOnce([]);

      const result = await pollQueuedJobs();

      expect(result.started).toBe(0);
    });

    it("should start queued jobs for auto-start repos", async () => {
      const job = makeJob();

      // getRunningJobCount: 0
      vi.mocked(queryOne).mockResolvedValueOnce({ total: BigInt(0) });

      // queryAll calls:
      // 1. autoStartRepos
      // 2. queuedJobs
      vi.mocked(queryAll)
        .mockResolvedValueOnce([
          {
            id: "repo-1",
            agent_provider: "claude-code",
          },
        ])
        .mockResolvedValueOnce([job]);

      // getRunningJobCount capacity re-check
      vi.mocked(queryOne).mockResolvedValueOnce({ total: BigInt(0) });

      // waitForWorktree poll - queryOne returns job with worktree ready
      vi.mocked(queryOne).mockResolvedValueOnce({
        ...job,
        status: "running",
        worktree_path: "/tmp/wt",
        branch: "agent/42",
      });

      const result = await pollQueuedJobs();

      expect(result.started).toBe(1);
      expect(startJobRun).toHaveBeenCalledWith("job-1");
      expect(startAgent).toHaveBeenCalledWith("job-1", "claude-code");
    });

    it("should skip jobs from repos without auto-start enabled", async () => {
      const job = makeJob({ repository_id: "repo-other" }); // Not in autostart repos

      // getRunningJobCount: 0
      vi.mocked(queryOne).mockResolvedValueOnce({ total: BigInt(0) });

      // queryAll:
      // 1. autoStartRepos (only repo-1)
      // 2. queuedJobs (job from repo-other)
      vi.mocked(queryAll)
        .mockResolvedValueOnce([
          {
            id: "repo-1",
            agent_provider: "claude-code",
          },
        ])
        .mockResolvedValueOnce([job]);

      const result = await pollQueuedJobs();

      expect(result.started).toBe(0);
      expect(startJobRun).not.toHaveBeenCalled();
    });

    it("should resume jobs that already have worktrees", async () => {
      const job = makeJob({
        worktree_path: "/tmp/existing-wt",
        branch: "agent/existing",
        claude_session_id: "old-session",
      });

      // getRunningJobCount: 0
      vi.mocked(queryOne).mockResolvedValueOnce({ total: BigInt(0) });

      vi.mocked(queryAll)
        .mockResolvedValueOnce([
          {
            id: "repo-1",
            agent_provider: "claude-code",
          },
        ])
        .mockResolvedValueOnce([job]);

      // Capacity re-check
      vi.mocked(queryOne).mockResolvedValueOnce({ total: BigInt(0) });

      const result = await pollQueuedJobs();

      expect(result.started).toBe(1);
      // Should NOT call startJobRun since worktree already exists
      expect(startJobRun).not.toHaveBeenCalled();
      // Should clear claude_session_id via execute
      expect(execute).toHaveBeenCalled();
    });

    it("should transition to paused when preflight checks fail", async () => {
      const job = makeJob({
        worktree_path: "/tmp/wt",
        branch: "agent/42",
      });

      // getRunningJobCount: 0
      vi.mocked(queryOne).mockResolvedValueOnce({ total: BigInt(0) });

      vi.mocked(queryAll)
        .mockResolvedValueOnce([
          {
            id: "repo-1",
            agent_provider: "unknown-agent",
          },
        ])
        .mockResolvedValueOnce([job]);

      // Capacity re-check
      vi.mocked(queryOne).mockResolvedValueOnce({ total: BigInt(0) });

      // transitionToPaused: queryOne for updated job
      vi.mocked(queryOne).mockResolvedValueOnce({ ...job, status: "paused" });

      // Agent registry doesn't have this type
      const { agentRegistry } = await import("./agents/index.js");
      vi.mocked(agentRegistry.get).mockReturnValue(undefined as never);

      const result = await pollQueuedJobs();

      expect(result.started).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("not registered");
    });

    it("should stop starting when capacity is reached mid-loop", async () => {
      const job1 = makeJob({
        id: "job-1",
        worktree_path: "/wt1",
        branch: "b1",
      });
      const job2 = makeJob({
        id: "job-2",
        worktree_path: "/wt2",
        branch: "b2",
      });

      // getRunningJobCount: initially 2 running (max is 3)
      vi.mocked(queryOne).mockResolvedValueOnce({ total: BigInt(2) });

      vi.mocked(queryAll)
        .mockResolvedValueOnce([
          {
            id: "repo-1",
            agent_provider: "claude-code",
          },
        ])
        .mockResolvedValueOnce([job1, job2]);

      // --- Job 1 flow ---
      // Capacity check: 2 running (OK, < 3)
      vi.mocked(queryOne).mockResolvedValueOnce({ total: BigInt(2) });
      // Step 2: read currentJob (status = running from startJobRun)
      vi.mocked(queryOne).mockResolvedValueOnce({ ...job1, status: "running" });
      // Step 2: read updatedJob after planning transition
      vi.mocked(queryOne).mockResolvedValueOnce({
        ...job1,
        status: "planning",
      });

      // --- Job 2 flow ---
      // Capacity check: 3 running (AT CAPACITY)
      vi.mocked(queryOne).mockResolvedValueOnce({ total: BigInt(3) });

      const result = await pollQueuedJobs();

      expect(result.started).toBe(1);
      expect(result.skipped).toBe(1);
    });

    it("should handle agent start failure gracefully", async () => {
      const job = makeJob({
        worktree_path: "/tmp/wt",
        branch: "agent/42",
      });

      // getRunningJobCount: 0
      vi.mocked(queryOne).mockResolvedValueOnce({ total: BigInt(0) });

      vi.mocked(queryAll)
        .mockResolvedValueOnce([
          {
            id: "repo-1",
            agent_provider: "claude-code",
          },
        ])
        .mockResolvedValueOnce([job]);

      // Capacity re-check
      vi.mocked(queryOne).mockResolvedValueOnce({ total: BigInt(0) });

      // transitionToPaused: queryOne for updated job
      vi.mocked(queryOne).mockResolvedValueOnce({ ...job, status: "paused" });

      vi.mocked(startAgent).mockResolvedValue({
        success: false,
        error: "Claude Code not installed",
      });

      const result = await pollQueuedJobs();

      expect(result.started).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("Claude Code not installed");
    });
  });
});
