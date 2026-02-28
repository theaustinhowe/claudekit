import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock node:fs to make validateSession pass
vi.mock("node:fs", () => ({
  existsSync: vi.fn().mockReturnValue(true),
}));

vi.mock("../utils/logger.js", () => ({
  createServiceLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock dependencies before importing the module
vi.mock("../db/index.js", () => ({
  getDb: vi.fn(async () => ({})),
}));

vi.mock("@claudekit/duckdb", () => ({
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

vi.mock("./github/index.js", () => ({
  createIssueComment: vi.fn().mockResolvedValue({ id: 12345 }),
  createIssueCommentForRepo: vi.fn().mockResolvedValue({ id: 12345 }),
  AGENT_COMMENT_MARKER: "<!-- gogo-agent -->",
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

vi.mock("../utils/job-logging.js", () => ({
  emitLog: vi.fn(),
}));

vi.mock("./health-events.js", () => ({
  emitHealthEvent: vi.fn(),
}));

vi.mock("./settings-helper.js", () => ({
  getClaudeSettings: vi.fn().mockResolvedValue({ max_runtime_ms: 600000 }),
}));

import { existsSync } from "node:fs";
import { execute, queryOne, withTransaction } from "@claudekit/duckdb";
import { cast } from "@claudekit/test-utils";
import { getDb } from "../db/index.js";
import { emitLog } from "../utils/job-logging.js";
import { broadcast } from "../ws/handler.js";
import { listAgents, resumeAgent, startAgent } from "./agent-executor.js";
import { agentRegistry } from "./agents/index.js";
import type { AgentCallbacks, AgentRunner } from "./agents/types.js";
import { createIssueCommentForRepo, getRepoConfigById } from "./github/index.js";
import { emitHealthEvent } from "./health-events.js";
import { getClaudeSettings } from "./settings-helper.js";
import { applyAction, applyTransitionAtomic } from "./state-machine.js";

describe("agent-executor", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    // Re-setup mocks after reset
    vi.mocked(execute).mockResolvedValue(undefined);
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(getDb).mockResolvedValue(cast({}));
    vi.mocked(getClaudeSettings).mockResolvedValue(cast({ max_runtime_ms: 600000 }));
    vi.mocked(emitLog).mockResolvedValue(undefined);
    vi.mocked(createIssueCommentForRepo).mockResolvedValue(cast({ id: 12345 }));
    vi.mocked(getRepoConfigById).mockResolvedValue(
      cast({
        id: "repo-1",
        owner: "test-owner",
        name: "test-repo",
      }),
    );
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
        return fn(cast({}));
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
        return fn(cast({}));
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

    it("should reject resume when job not found", async () => {
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

      vi.mocked(agentRegistry.get).mockReturnValue(mockRunner as AgentRunner);
      vi.mocked(queryOne).mockResolvedValue(undefined);

      const result = await resumeAgent("nonexistent", "Test", "claude-code");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Job not found");
    });

    it("should reject resume from needs_info without session", async () => {
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
        status: "needs_info",
        claude_session_id: null,
        worktree_path: "/path",
        branch: "main",
      };

      vi.mocked(agentRegistry.get).mockReturnValue(mockRunner as AgentRunner);
      vi.mocked(queryOne).mockResolvedValue(mockJob);

      const result = await resumeAgent("job-1", "answer", "claude-code");

      expect(result.success).toBe(false);
      expect(result.error).toBe("No session ID to resume from");
    });

    it("should reject resume from done state", async () => {
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
        status: "done",
        claude_session_id: "session-123",
      };

      vi.mocked(agentRegistry.get).mockReturnValue(mockRunner as AgentRunner);
      vi.mocked(queryOne).mockResolvedValue(mockJob);

      const result = await resumeAgent("job-1", "Test", "claude-code");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Can only resume from paused or needs_info state");
    });

    it("should reject resume from failed state", async () => {
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
        status: "failed",
        claude_session_id: "session-123",
      };

      vi.mocked(agentRegistry.get).mockReturnValue(mockRunner as AgentRunner);
      vi.mocked(queryOne).mockResolvedValue(mockJob);

      const result = await resumeAgent("job-1", "Test", "claude-code");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Can only resume from paused or needs_info state");
    });

    it("should handle missing session file by clearing session", async () => {
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
        claude_session_id: "stale-session-123",
        issue_number: 42,
        issue_title: "Test",
        issue_body: "Test",
        worktree_path: "/path/to/worktree",
        branch: "feature/test",
        repository_id: "repo-1",
        agent_session_data: null,
      };

      vi.mocked(agentRegistry.get).mockReturnValue(mockRunner as AgentRunner);
      vi.mocked(queryOne).mockResolvedValue(mockJob);
      vi.mocked(existsSync).mockReturnValue(false); // Session file missing
      vi.mocked(applyAction).mockReturnValue({
        newStatus: "running",
        eventType: "user_action",
        updates: { pause_reason: null, needs_info_question: null },
      });

      const result = await resumeAgent("job-1", "Test", "claude-code");

      // Should fail because session file is missing
      expect(result.success).toBe(false);
      expect(result.error).toContain("Session has been cleared");
      // Should have cleared the stale session
      expect(execute).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining("claude_session_id = NULL"),
        expect.any(Array),
      );
    });

    it("should reject resume when job has no worktree_path or branch", async () => {
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
        worktree_path: null,
        branch: null,
        repository_id: "repo-1",
      };

      vi.mocked(agentRegistry.get).mockReturnValue(mockRunner as AgentRunner);
      vi.mocked(queryOne).mockResolvedValue(mockJob);

      const result = await resumeAgent("job-1", "Test", "claude-code");

      expect(result.success).toBe(false);
      expect(result.error).toContain("missing worktree path or branch");
    });

    it("should reject resume when job has no repository_id", async () => {
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
        worktree_path: "/path",
        branch: "main",
        repository_id: null,
      };

      vi.mocked(agentRegistry.get).mockReturnValue(mockRunner as AgentRunner);
      vi.mocked(queryOne).mockResolvedValue(mockJob);

      const result = await resumeAgent("job-1", "Test", "claude-code");

      expect(result.success).toBe(false);
      expect(result.error).toContain("does not have a repository ID");
    });

    it("should use default agent type claude-code when none specified", async () => {
      vi.mocked(agentRegistry.get).mockReturnValue(undefined);

      const result = await resumeAgent("job-1", "Test");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Unknown agent type: claude-code");
      // Verifies default agent type is used
      expect(agentRegistry.get).toHaveBeenCalledWith("claude-code");
    });

    it("should return error when applyAction returns an error", async () => {
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
        issue_title: "Test",
        issue_body: "body",
        worktree_path: "/path/to/worktree",
        branch: "feature/test",
        repository_id: "repo-1",
        agent_session_data: null,
      };

      vi.mocked(agentRegistry.get).mockReturnValue(mockRunner as AgentRunner);
      vi.mocked(queryOne).mockResolvedValue(mockJob);
      vi.mocked(applyAction).mockReturnValue(
        cast({
          error: "Invalid transition: cannot resume from paused",
        }),
      );

      const result = await resumeAgent("job-1", "Test", "claude-code");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid transition");
      expect(mockRunner.resume).not.toHaveBeenCalled();
    });

    it("should return error when job not found inside transaction", async () => {
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
        issue_title: "Test",
        issue_body: "body",
        worktree_path: "/path/to/worktree",
        branch: "feature/test",
        repository_id: "repo-1",
        agent_session_data: null,
      };

      vi.mocked(agentRegistry.get).mockReturnValue(mockRunner as AgentRunner);
      vi.mocked(queryOne).mockResolvedValue(mockJob);
      vi.mocked(applyAction).mockReturnValue({
        newStatus: "running",
        eventType: "user_action",
        updates: { pause_reason: null, needs_info_question: null },
      });

      // Inside withTransaction, queryOne returns undefined (job was deleted)
      vi.mocked(withTransaction).mockImplementation(async (_conn, fn) => {
        vi.mocked(queryOne).mockResolvedValueOnce(undefined);
        return fn(cast({}));
      });

      const result = await resumeAgent("job-1", "Test", "claude-code");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Job not found");
      expect(mockRunner.resume).not.toHaveBeenCalled();
    });

    it("should parse agent_session_data JSON when resuming", async () => {
      const mockRunner: Partial<AgentRunner> = {
        type: "claude-code",
        displayName: "Claude Code",
        isRunning: vi.fn().mockReturnValue(false),
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
        agent_session_data: JSON.stringify({ extra: "data" }),
      };

      vi.mocked(agentRegistry.get).mockReturnValue(mockRunner as AgentRunner);
      vi.mocked(queryOne).mockResolvedValue(mockJob);
      vi.mocked(applyAction).mockReturnValue({
        newStatus: "running",
        eventType: "user_action",
        updates: { pause_reason: null, needs_info_question: null },
      });

      vi.mocked(withTransaction).mockImplementation(async (_conn, fn) => {
        return fn(cast({}));
      });

      const result = await resumeAgent("job-1", "Test", "claude-code");
      expect(result.success).toBe(true);
    });

    it("should handle invalid agent_session_data JSON gracefully", async () => {
      const mockRunner: Partial<AgentRunner> = {
        type: "claude-code",
        displayName: "Claude Code",
        isRunning: vi.fn().mockReturnValue(false),
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
        agent_session_data: "not-valid-json{{{",
      };

      vi.mocked(agentRegistry.get).mockReturnValue(mockRunner as AgentRunner);
      vi.mocked(queryOne).mockResolvedValue(mockJob);
      vi.mocked(applyAction).mockReturnValue({
        newStatus: "running",
        eventType: "user_action",
        updates: { pause_reason: null, needs_info_question: null },
      });

      vi.mocked(withTransaction).mockImplementation(async (_conn, fn) => {
        return fn(cast({}));
      });

      const result = await resumeAgent("job-1", "Test", "claude-code");
      expect(result.success).toBe(true);
    });

    it("should handle agent resume failure gracefully", async () => {
      const mockRunner: Partial<AgentRunner> = {
        type: "claude-code",
        displayName: "Claude Code",
        isRunning: vi.fn().mockReturnValue(false),
        resume: vi.fn().mockResolvedValue({ success: false, error: "Agent process crashed" }),
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
      vi.mocked(queryOne).mockResolvedValue(mockJob);
      vi.mocked(applyAction).mockReturnValue({
        newStatus: "running",
        eventType: "user_action",
        updates: { pause_reason: null, needs_info_question: null },
      });

      vi.mocked(withTransaction).mockImplementation(async (_conn, fn) => {
        return fn(cast({}));
      });

      const result = await resumeAgent("job-1", "Test", "claude-code");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Agent process crashed");
      expect(mockRunner.resume).toHaveBeenCalled();
    });
  });

  describe("startAgent additional validation", () => {
    it("should return error when job has no worktree_path", async () => {
      const mockJob = {
        id: "job-1",
        status: "running",
        issue_number: 42,
        issue_title: "Test",
        worktree_path: null,
        branch: "main",
        repository_id: "repo-1",
      };

      vi.mocked(queryOne).mockResolvedValue(mockJob);

      const result = await startAgent("job-1");

      expect(result.success).toBe(false);
      expect(result.error).toContain("does not have a worktree path or branch set");
    });

    it("should return error when job has no branch", async () => {
      const mockJob = {
        id: "job-1",
        status: "running",
        issue_number: 42,
        issue_title: "Test",
        worktree_path: "/path",
        branch: null,
        repository_id: "repo-1",
      };

      vi.mocked(queryOne).mockResolvedValue(mockJob);

      const result = await startAgent("job-1");

      expect(result.success).toBe(false);
      expect(result.error).toContain("does not have a worktree path or branch set");
    });

    it("should return error when job has no repository_id", async () => {
      const mockJob = {
        id: "job-1",
        status: "running",
        issue_number: 42,
        issue_title: "Test",
        worktree_path: "/path",
        branch: "main",
        repository_id: null,
      };

      vi.mocked(queryOne).mockResolvedValue(mockJob);

      const result = await startAgent("job-1");

      expect(result.success).toBe(false);
      expect(result.error).toContain("does not have a repository ID");
    });

    it("should accept job in planning state", async () => {
      const mockRunner: Partial<AgentRunner> = {
        type: "claude-code",
        displayName: "Claude Code",
        isRunning: vi.fn().mockReturnValue(false),
        start: vi.fn().mockResolvedValue({ success: true }),
        capabilities: {
          canResume: true,
          canInject: true,
          supportsStreaming: true,
        },
      };

      const mockJob = {
        id: "job-1",
        status: "planning",
        issue_number: 42,
        issue_title: "Test",
        issue_body: "body",
        worktree_path: "/path",
        branch: "main",
        repository_id: "repo-1",
      };

      vi.mocked(queryOne).mockResolvedValue(mockJob);
      vi.mocked(agentRegistry.getAll).mockReturnValue([mockRunner as AgentRunner]);

      const result = await startAgent("job-1");

      expect(result.success).toBe(true);
      expect(mockRunner.start).toHaveBeenCalled();
    });

    it("should use specified agent type when provided", async () => {
      const mockRunner: Partial<AgentRunner> = {
        type: "custom-agent",
        displayName: "Custom Agent",
        isRunning: vi.fn().mockReturnValue(false),
        start: vi.fn().mockResolvedValue({ success: true }),
        capabilities: {
          canResume: true,
          canInject: true,
          supportsStreaming: true,
        },
      };

      const mockJob = {
        id: "job-1",
        status: "running",
        issue_number: 42,
        issue_title: "Test",
        issue_body: "body",
        worktree_path: "/path",
        branch: "main",
        repository_id: "repo-1",
      };

      vi.mocked(queryOne).mockResolvedValue(mockJob);
      vi.mocked(agentRegistry.get).mockReturnValue(mockRunner as AgentRunner);

      const result = await startAgent("job-1", "custom-agent");

      expect(result.success).toBe(true);
      expect(agentRegistry.get).toHaveBeenCalledWith("custom-agent");
    });
  });

  describe("createAgentCallbacks (via startAgent)", () => {
    let capturedCallbacks: AgentCallbacks;

    beforeEach(async () => {
      const mockRunner: Partial<AgentRunner> = {
        type: "claude-code",
        displayName: "Claude Code",
        isRunning: vi.fn().mockReturnValue(false),
        start: vi.fn().mockImplementation(async (_ctx, _config, callbacks) => {
          capturedCallbacks = callbacks;
          return { success: true };
        }),
        capabilities: {
          canResume: true,
          canInject: true,
          supportsStreaming: true,
        },
      };

      const mockJob = {
        id: "job-cb",
        status: "running",
        issue_number: 42,
        issue_title: "Test",
        issue_body: "body",
        worktree_path: "/path",
        branch: "main",
        repository_id: "repo-1",
      };

      vi.mocked(queryOne).mockResolvedValue(mockJob);
      vi.mocked(agentRegistry.getAll).mockReturnValue([mockRunner as AgentRunner]);

      const result = await startAgent("job-cb");
      expect(result.success).toBe(true);
    });

    it("onLog should emit a log entry", async () => {
      await capturedCallbacks.onLog("stdout", "Hello world");
      expect(emitLog).toHaveBeenCalledWith("job-cb", "stdout", "Hello world", expect.any(Object));
    });

    it("onSignal ready_to_pr should transition job", async () => {
      await capturedCallbacks.onSignal({ type: "ready_to_pr" });
      expect(applyTransitionAtomic).toHaveBeenCalledWith("job-cb", "ready_to_pr", "Agent completed work");
      expect(emitHealthEvent).toHaveBeenCalledWith(
        "agent_stopped",
        expect.stringContaining("Agent completed work"),
        expect.objectContaining({ jobId: "job-cb", reason: "ready_to_pr" }),
      );
    });

    it("onSignal needs_info should transition with question for normal issues", async () => {
      vi.mocked(createIssueCommentForRepo).mockResolvedValue(cast({ id: 99999 }));
      await capturedCallbacks.onSignal({ type: "needs_info", question: "What version?" });
      expect(createIssueCommentForRepo).toHaveBeenCalledWith("repo-1", 42, expect.stringContaining("What version?"));
      expect(applyTransitionAtomic).toHaveBeenCalledWith(
        "job-cb",
        "needs_info",
        "What version?",
        expect.objectContaining({ needs_info_question: "What version?", needs_info_comment_id: 99999 }),
      );
    });

    it("onSignal needs_info should skip GitHub comment for manual jobs", async () => {
      // Re-run startAgent with negative issue number (manual job)
      const mockRunner2: Partial<AgentRunner> = {
        type: "claude-code",
        displayName: "Claude Code",
        isRunning: vi.fn().mockReturnValue(false),
        start: vi.fn().mockImplementation(async (_ctx, _config, callbacks) => {
          capturedCallbacks = callbacks;
          return { success: true };
        }),
        capabilities: { canResume: true, canInject: true, supportsStreaming: true },
      };

      const manualJob = {
        id: "job-manual",
        status: "running",
        issue_number: -1,
        issue_title: "Manual",
        issue_body: "body",
        worktree_path: "/path",
        branch: "main",
        repository_id: "repo-1",
      };

      vi.mocked(queryOne).mockResolvedValue(manualJob);
      vi.mocked(agentRegistry.getAll).mockReturnValue([mockRunner2 as AgentRunner]);

      await startAgent("job-manual");

      await capturedCallbacks.onSignal({ type: "needs_info", question: "Manual question?" });
      expect(createIssueCommentForRepo).not.toHaveBeenCalled();
      expect(applyTransitionAtomic).toHaveBeenCalledWith(
        "job-manual",
        "needs_info",
        "Manual question?",
        expect.objectContaining({ needs_info_question: "Manual question?" }),
      );
    });

    it("onSignal needs_info should handle GitHub comment failure", async () => {
      vi.mocked(createIssueCommentForRepo).mockRejectedValue(new Error("GitHub API error"));
      await capturedCallbacks.onSignal({ type: "needs_info", question: "Failing question?" });
      expect(emitLog).toHaveBeenCalledWith(
        "job-cb",
        "stderr",
        expect.stringContaining("Failed to post question"),
        expect.any(Object),
      );
    });

    it("onSignal error should transition to failed", async () => {
      await capturedCallbacks.onSignal({ type: "error", message: "Something broke" });
      expect(applyTransitionAtomic).toHaveBeenCalledWith(
        "job-cb",
        "failed",
        "Something broke",
        expect.objectContaining({ failure_reason: "Something broke" }),
      );
      expect(emitHealthEvent).toHaveBeenCalledWith(
        "agent_stopped",
        expect.stringContaining("Agent error"),
        expect.objectContaining({ jobId: "job-cb", reason: "error" }),
      );
    });

    it("onSignal completed should emit health event", async () => {
      await capturedCallbacks.onSignal({ type: "completed", summary: "All done!" });
      expect(emitHealthEvent).toHaveBeenCalledWith(
        "agent_stopped",
        expect.stringContaining("Agent completed"),
        expect.objectContaining({ jobId: "job-cb", reason: "completed" }),
      );
    });

    it("onSignal completed with no summary should use default message", async () => {
      await capturedCallbacks.onSignal(cast({ type: "completed" }));
      expect(emitLog).toHaveBeenCalledWith("job-cb", "system", "Agent completed", expect.any(Object));
    });

    it("onSessionCreated should update job with session ID", async () => {
      await capturedCallbacks.onSessionCreated("session-abc-123");
      expect(execute).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining("claude_session_id"),
        expect.arrayContaining(["session-abc-123"]),
      );
      expect(emitLog).toHaveBeenCalledWith(
        "job-cb",
        "system",
        expect.stringContaining("session-abc-123"),
        expect.any(Object),
      );
    });

    it("onPhaseChange should update job phase and progress", async () => {
      vi.mocked(queryOne).mockResolvedValue({ id: "job-cb", status: "running" });
      await capturedCallbacks.onPhaseChange("analyzing", 0.5);
      expect(execute).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining("phase"),
        expect.arrayContaining(["analyzing", 0.5]),
      );
      expect(broadcast).toHaveBeenCalledWith(expect.objectContaining({ type: "job:updated" }));
    });

    it("onPhaseChange should handle null progress", async () => {
      vi.mocked(queryOne).mockResolvedValue({ id: "job-cb", status: "running" });
      await capturedCallbacks.onPhaseChange("complete");
      expect(execute).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining("phase"),
        expect.arrayContaining(["complete", null]),
      );
    });

    it("onPhaseChange should not broadcast if job not found", async () => {
      vi.mocked(queryOne).mockResolvedValue(undefined);
      await capturedCallbacks.onPhaseChange("unknown");
      expect(broadcast).not.toHaveBeenCalled();
    });
  });

  describe("listAgents", () => {
    it("should return empty array when no agents registered", () => {
      vi.mocked(agentRegistry.getAll).mockReturnValue([]);
      const agents = listAgents();
      expect(agents).toEqual([]);
    });

    it("should return agent info for all registered agents", () => {
      const mockRunners = [
        {
          type: "claude-code",
          displayName: "Claude Code",
          capabilities: {
            canResume: true,
            canInject: true,
            supportsStreaming: true,
          },
        },
        {
          type: "mock-agent",
          displayName: "Mock Agent",
          capabilities: {
            canResume: false,
            canInject: false,
            supportsStreaming: false,
          },
        },
      ];

      vi.mocked(agentRegistry.getAll).mockReturnValue(mockRunners as AgentRunner[]);
      const agents = listAgents();

      expect(agents).toHaveLength(2);
      expect(agents[0]).toEqual({
        type: "claude-code",
        displayName: "Claude Code",
        capabilities: {
          canResume: true,
          canInject: true,
          supportsStreaming: true,
        },
      });
      expect(agents[1]).toEqual({
        type: "mock-agent",
        displayName: "Mock Agent",
        capabilities: {
          canResume: false,
          canInject: false,
          supportsStreaming: false,
        },
      });
    });
  });
});
