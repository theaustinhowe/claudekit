import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock node:fs to make validateSession pass
vi.mock("node:fs", () => ({
  existsSync: vi.fn().mockReturnValue(true),
}));

// Mock dependencies before importing the module
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
  parseJsonField: vi.fn((v: unknown, fallback: unknown) => (v === null || v === undefined ? fallback : v)),
}));

vi.mock("../ws/handler.js", () => ({
  broadcast: vi.fn(),
  sendLogToSubscribers: vi.fn(),
}));

vi.mock("./github.js", () => ({
  createIssueComment: vi.fn().mockResolvedValue({ id: 12345 }),
  createIssueCommentForRepo: vi.fn().mockResolvedValue({ id: 12345 }),
  getRepoConfigById: vi.fn().mockResolvedValue({
    id: "repo-1",
    owner: "test-owner",
    name: "test-repo",
  }),
}));

vi.mock("./agents/index.js", () => ({
  agentRegistry: {
    get: vi.fn(),
    getAll: vi.fn(),
  },
}));

vi.mock("./state-machine.js", () => ({
  applyAction: vi.fn(),
  applyTransitionAtomic: vi.fn(),
}));

import { existsSync } from "node:fs";
import { execute, queryOne, withTransaction } from "@devkit/duckdb";
import { resumeAgent, startAgent } from "./agent-executor.js";
import { agentRegistry } from "./agents/index.js";
import type { AgentRunner } from "./agents/types.js";
import { applyAction } from "./state-machine.js";

describe("agent-executor", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    // Re-setup execute mock after reset
    vi.mocked(execute).mockResolvedValue(undefined);

    // Mock existsSync to return true (session file exists)
    vi.mocked(existsSync).mockReturnValue(true);
  });

  describe("resumeAgent idempotency", () => {
    it("should return success without spawning duplicate when agent is already running", async () => {
      const mockRunner: Partial<AgentRunner> = {
        type: "claude-code",
        displayName: "Claude Code",
        isRunning: vi.fn().mockReturnValue(true), // Already running
        resume: vi.fn(),
        capabilities: {
          canResume: true,
          canInject: true,
          supportsStreaming: true,
        },
      };

      vi.mocked(agentRegistry.get).mockReturnValue(mockRunner as AgentRunner);

      const result = await resumeAgent("job-1", "Test message", "claude-code");

      expect(result.success).toBe(true);
      expect(mockRunner.resume).not.toHaveBeenCalled(); // Should not spawn again
    });

    it("should start agent when not already running", async () => {
      const mockRunner: Partial<AgentRunner> = {
        type: "claude-code",
        displayName: "Claude Code",
        isRunning: vi.fn().mockReturnValue(false), // Not running
        resume: vi.fn().mockResolvedValue({ success: true }),
        capabilities: {
          canResume: true,
          canInject: true,
          supportsStreaming: true,
        },
      };

      const mockJob = {
        id: "job-1",
        status: "paused",
        claude_session_id: "session-123",
        issue_number: 42,
        issue_title: "Test Issue",
        issue_body: "Test body",
        worktree_path: "/path/to/worktree",
        branch: "feature/test",
        repository_id: "repo-1",
        agent_session_data: null,
      };

      vi.mocked(agentRegistry.get).mockReturnValue(mockRunner as AgentRunner);
      vi.mocked(applyAction).mockReturnValue({
        newStatus: "running",
        eventType: "user_action",
        updates: { pause_reason: null, needs_info_question: null },
      });

      // Mock queryOne for initial job fetch
      vi.mocked(queryOne).mockResolvedValue(mockJob);

      // Mock withTransaction for atomic state change
      vi.mocked(withTransaction).mockImplementation(async (_conn, fn) => {
        return fn({} as never);
      });

      const result = await resumeAgent("job-1", "Test message", "claude-code");

      expect(result.success).toBe(true);
      expect(mockRunner.resume).toHaveBeenCalled();
    });

    it("should return error for unknown agent type", async () => {
      vi.mocked(agentRegistry.get).mockReturnValue(undefined);

      const result = await resumeAgent("job-1", "Test", "unknown-agent");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Unknown agent type: unknown-agent");
    });

    it("should return error if job state changed during resume transaction", async () => {
      const mockRunner: Partial<AgentRunner> = {
        type: "claude-code",
        displayName: "Claude Code",
        isRunning: vi.fn().mockReturnValue(false),
        resume: vi.fn(),
        capabilities: {
          canResume: true,
          canInject: true,
          supportsStreaming: true,
        },
      };

      const mockJob = {
        id: "job-1",
        status: "paused",
        claude_session_id: "session-123",
        issue_number: 42,
        issue_title: "Test Issue",
        issue_body: "Test body",
        worktree_path: "/path/to/worktree",
        branch: "feature/test",
        repository_id: "repo-1",
        agent_session_data: null,
      };

      // Job changed to running during transaction (race condition)
      const jobInTransaction = { ...mockJob, status: "running" };

      vi.mocked(agentRegistry.get).mockReturnValue(mockRunner as AgentRunner);
      vi.mocked(applyAction).mockReturnValue({
        newStatus: "running",
        eventType: "user_action",
        updates: { pause_reason: null, needs_info_question: null },
      });

      // queryOne returns the paused job initially
      vi.mocked(queryOne).mockResolvedValue(mockJob);

      // withTransaction executes the callback, but inside the transaction
      // queryOne returns the changed state
      vi.mocked(withTransaction).mockImplementation(async (_conn, fn) => {
        // Override queryOne inside transaction to return changed state
        vi.mocked(queryOne).mockResolvedValueOnce(jobInTransaction);
        return fn({} as never);
      });

      const result = await resumeAgent("job-1", "Test message", "claude-code");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Job state changed during resume");
      expect(mockRunner.resume).not.toHaveBeenCalled();
    });
  });

  describe("startAgent concurrency", () => {
    it("should return error if job not in running state", async () => {
      const mockJob = {
        id: "job-1",
        status: "paused", // Not running
        issue_number: 42,
        issue_title: "Test",
        worktree_path: "/path",
        branch: "main",
      };

      vi.mocked(queryOne).mockResolvedValue(mockJob);

      const result = await startAgent("job-1");

      expect(result.success).toBe(false);
      expect(result.error).toContain("must be in 'running' or 'planning' state");
    });

    it("should return error if job not found", async () => {
      vi.mocked(queryOne).mockResolvedValue(undefined);

      const result = await startAgent("nonexistent");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Job not found");
    });

    it("should return error if no agents are configured", async () => {
      const mockJob = {
        id: "job-1",
        status: "running",
        issue_number: 42,
        issue_title: "Test",
        worktree_path: "/path",
        branch: "main",
        repository_id: "repo-1",
      };

      vi.mocked(queryOne).mockResolvedValue(mockJob);

      vi.mocked(agentRegistry.getAll).mockReturnValue([]);

      const result = await startAgent("job-1");

      expect(result.success).toBe(false);
      expect(result.error).toBe("No agents configured");
    });

    it("should return error for unknown agent type", async () => {
      const mockJob = {
        id: "job-1",
        status: "running",
        issue_number: 42,
        issue_title: "Test",
        worktree_path: "/path",
        branch: "main",
        repository_id: "repo-1",
      };

      vi.mocked(queryOne).mockResolvedValue(mockJob);

      vi.mocked(agentRegistry.get).mockReturnValue(undefined);

      const result = await startAgent("job-1", "nonexistent-agent");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Unknown agent type: nonexistent-agent");
    });
  });

  describe("resumeAgent validation", () => {
    it("should reject resume from non-resumable state", async () => {
      const mockRunner: Partial<AgentRunner> = {
        type: "claude-code",
        displayName: "Claude Code",
        isRunning: vi.fn().mockReturnValue(false),
        capabilities: {
          canResume: true,
          canInject: true,
          supportsStreaming: true,
        },
      };

      const mockJob = {
        id: "job-1",
        status: "running", // Already running - not a resumable state
        claude_session_id: "session-123",
      };

      vi.mocked(agentRegistry.get).mockReturnValue(mockRunner as AgentRunner);
      vi.mocked(queryOne).mockResolvedValue(mockJob);

      const result = await resumeAgent("job-1", "Test", "claude-code");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Can only resume from paused or needs_info state");
    });

    it("should reject resume if no session ID exists", async () => {
      const mockRunner: Partial<AgentRunner> = {
        type: "claude-code",
        displayName: "Claude Code",
        isRunning: vi.fn().mockReturnValue(false),
        capabilities: {
          canResume: true,
          canInject: true,
          supportsStreaming: true,
        },
      };

      const mockJob = {
        id: "job-1",
        status: "paused",
        claude_session_id: null, // No session to resume
        worktree_path: "/path",
        branch: "main",
      };

      vi.mocked(agentRegistry.get).mockReturnValue(mockRunner as AgentRunner);
      vi.mocked(queryOne).mockResolvedValue(mockJob);

      const result = await resumeAgent("job-1", "Test", "claude-code");

      expect(result.success).toBe(false);
      expect(result.error).toBe("No session ID to resume from");
    });

    it("should reject resume if agent does not support resume", async () => {
      const mockRunner: Partial<AgentRunner> = {
        type: "mock-agent",
        displayName: "Mock Agent",
        isRunning: vi.fn().mockReturnValue(false),
        capabilities: {
          canResume: false,
          canInject: false,
          supportsStreaming: false,
        }, // Does not support resume
        resume: undefined, // No resume method
      };

      const mockJob = {
        id: "job-1",
        status: "paused",
        claude_session_id: "session-123",
        worktree_path: "/path",
        branch: "main",
      };

      vi.mocked(agentRegistry.get).mockReturnValue(mockRunner as AgentRunner);
      vi.mocked(queryOne).mockResolvedValue(mockJob);

      const result = await resumeAgent("job-1", "Test", "mock-agent");

      expect(result.success).toBe(false);
      expect(result.error).toContain("does not support resume");
    });
  });
});
