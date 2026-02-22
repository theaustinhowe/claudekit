import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock dependencies
vi.mock("../claude-code-agent.js", () => ({
  CLAUDE_ERRORS: {
    CLI_NOT_FOUND: "Claude CLI not found. Install it with: npm install -g @anthropic-ai/claude-code",
    DISABLED: "Claude Code is disabled in settings. Enable it in the Settings page.",
  },
  getActiveRunCount: vi.fn(),
  getClaudeAvailabilityError: vi.fn(),
  injectMessage: vi.fn(),
  isClaudeCliAvailable: vi.fn(),
  isRunning: vi.fn(),
  resumeClaudeRun: vi.fn(),
  startClaudeRun: vi.fn(),
  stopClaudeRun: vi.fn(),
}));

vi.mock("../settings-helper.js", () => ({
  getClaudeSettings: vi.fn(),
}));

import {
  CLAUDE_ERRORS,
  getActiveRunCount,
  getClaudeAvailabilityError,
  injectMessage as injectClaudeMessage,
  isClaudeCliAvailable,
  isRunning as isRunningClaude,
  resumeClaudeRun,
  startClaudeRun,
  stopClaudeRun,
} from "../claude-code-agent.js";
import { getClaudeSettings } from "../settings-helper.js";
import { claudeCodeRunner, getClaudeRunnerStatus } from "./claude-code-runner.js";
import type { AgentCallbacks, AgentConfig, AgentJobContext, AgentSession } from "./types.js";

const makeContext = (overrides?: Partial<AgentJobContext>): AgentJobContext => ({
  jobId: "job-1",
  issueNumber: 42,
  issueTitle: "Fix the bug",
  issueBody: "Description of the bug",
  worktreePath: "/tmp/worktrees/issue-42",
  branch: "agent/issue-42",
  repositoryOwner: "testowner",
  repositoryName: "testrepo",
  ...overrides,
});

const makeCallbacks = (): AgentCallbacks => ({
  onLog: vi.fn(),
  onSignal: vi.fn(),
  onSessionCreated: vi.fn(),
  onPhaseChange: vi.fn(),
});

const makeConfig = (): AgentConfig => ({
  maxRuntimeMs: 3600000,
});

const makeSession = (): AgentSession => ({
  sessionId: "session-abc",
  agentType: "claude-code",
});

describe("claude-code-runner", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("claudeCodeRunner metadata", () => {
    it("should have the correct type", () => {
      expect(claudeCodeRunner.type).toBe("claude-code");
    });

    it("should have the correct display name", () => {
      expect(claudeCodeRunner.displayName).toBe("Claude Code");
    });

    it("should report correct capabilities", () => {
      expect(claudeCodeRunner.capabilities).toEqual({
        canResume: true,
        canInject: true,
        supportsStreaming: true,
      });
    });
  });

  describe("start", () => {
    it("should return error when Claude is not available", async () => {
      vi.mocked(getClaudeAvailabilityError).mockResolvedValue("Claude CLI not found");

      const result = await claudeCodeRunner.start(makeContext(), makeConfig(), makeCallbacks());

      expect(result.success).toBe(false);
      expect(result.error).toBe("Claude CLI not found");
      expect(startClaudeRun).not.toHaveBeenCalled();
    });

    it("should delegate to startClaudeRun when available", async () => {
      vi.mocked(getClaudeAvailabilityError).mockResolvedValue(null);
      vi.mocked(startClaudeRun).mockResolvedValue({ success: true });

      const context = makeContext({ jobId: "job-99" });
      const result = await claudeCodeRunner.start(context, makeConfig(), makeCallbacks());

      expect(result.success).toBe(true);
      expect(startClaudeRun).toHaveBeenCalledWith("job-99");
    });

    it("should propagate failure from startClaudeRun", async () => {
      vi.mocked(getClaudeAvailabilityError).mockResolvedValue(null);
      vi.mocked(startClaudeRun).mockResolvedValue({ success: false, error: "Job not found" });

      const result = await claudeCodeRunner.start(makeContext(), makeConfig(), makeCallbacks());

      expect(result.success).toBe(false);
      expect(result.error).toBe("Job not found");
    });
  });

  describe("resume", () => {
    const resume = claudeCodeRunner.resume as NonNullable<typeof claudeCodeRunner.resume>;

    it("should return error when Claude is not available", async () => {
      vi.mocked(getClaudeAvailabilityError).mockResolvedValue("Claude Code is disabled");

      const result = await resume(makeContext(), makeSession(), makeConfig(), makeCallbacks());

      expect(result.success).toBe(false);
      expect(result.error).toBe("Claude Code is disabled");
      expect(resumeClaudeRun).not.toHaveBeenCalled();
    });

    it("should delegate to resumeClaudeRun when available", async () => {
      vi.mocked(getClaudeAvailabilityError).mockResolvedValue(null);
      vi.mocked(resumeClaudeRun).mockResolvedValue({ success: true });

      const context = makeContext({ jobId: "job-42" });
      const result = await resume(context, makeSession(), makeConfig(), makeCallbacks());

      expect(result.success).toBe(true);
      expect(resumeClaudeRun).toHaveBeenCalledWith("job-42", undefined);
    });

    it("should pass the resume message to resumeClaudeRun", async () => {
      vi.mocked(getClaudeAvailabilityError).mockResolvedValue(null);
      vi.mocked(resumeClaudeRun).mockResolvedValue({ success: true });

      const context = makeContext({ jobId: "job-42" });
      const result = await resume(context, makeSession(), makeConfig(), makeCallbacks(), "Continue with the fix");

      expect(result.success).toBe(true);
      expect(resumeClaudeRun).toHaveBeenCalledWith("job-42", "Continue with the fix");
    });

    it("should propagate failure from resumeClaudeRun", async () => {
      vi.mocked(getClaudeAvailabilityError).mockResolvedValue(null);
      vi.mocked(resumeClaudeRun).mockResolvedValue({ success: false, error: "Session not found" });

      const result = await resume(makeContext(), makeSession(), makeConfig(), makeCallbacks());

      expect(result.success).toBe(false);
      expect(result.error).toBe("Session not found");
    });
  });

  describe("inject", () => {
    const inject = claudeCodeRunner.inject as NonNullable<typeof claudeCodeRunner.inject>;

    it("should return error when Claude is not available", async () => {
      vi.mocked(getClaudeAvailabilityError).mockResolvedValue("CLI not found");

      const result = await inject("job-1", "some message", "immediate");

      expect(result.success).toBe(false);
      expect(result.error).toBe("CLI not found");
      expect(injectClaudeMessage).not.toHaveBeenCalled();
    });

    it("should delegate to injectMessage with correct parameters", async () => {
      vi.mocked(getClaudeAvailabilityError).mockResolvedValue(null);
      vi.mocked(injectClaudeMessage).mockResolvedValue({ success: true });

      const result = await inject("job-1", "review feedback", "queued");

      expect(result.success).toBe(true);
      expect(injectClaudeMessage).toHaveBeenCalledWith("job-1", "review feedback", "queued");
    });

    it("should propagate failure from injectMessage", async () => {
      vi.mocked(getClaudeAvailabilityError).mockResolvedValue(null);
      vi.mocked(injectClaudeMessage).mockResolvedValue({ success: false, error: "Not running" });

      const result = await inject("job-1", "msg", "immediate");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Not running");
    });
  });

  describe("stop", () => {
    it("should delegate to stopClaudeRun", async () => {
      vi.mocked(stopClaudeRun).mockResolvedValue(true);

      const result = await claudeCodeRunner.stop("job-1");

      expect(result).toBe(true);
      expect(stopClaudeRun).toHaveBeenCalledWith("job-1", false);
    });

    it("should pass saveSession parameter", async () => {
      vi.mocked(stopClaudeRun).mockResolvedValue(true);

      const result = await claudeCodeRunner.stop("job-1", true);

      expect(result).toBe(true);
      expect(stopClaudeRun).toHaveBeenCalledWith("job-1", true);
    });

    it("should return false when job is not running", async () => {
      vi.mocked(stopClaudeRun).mockResolvedValue(false);

      const result = await claudeCodeRunner.stop("nonexistent");

      expect(result).toBe(false);
    });
  });

  describe("isRunning", () => {
    it("should delegate to isRunning from claude-code-agent", () => {
      vi.mocked(isRunningClaude).mockReturnValue(true);

      expect(claudeCodeRunner.isRunning("job-1")).toBe(true);
      expect(isRunningClaude).toHaveBeenCalledWith("job-1");
    });

    it("should return false for non-running jobs", () => {
      vi.mocked(isRunningClaude).mockReturnValue(false);

      expect(claudeCodeRunner.isRunning("job-1")).toBe(false);
    });
  });

  describe("getActiveRunCount", () => {
    it("should delegate to getActiveRunCount from claude-code-agent", () => {
      vi.mocked(getActiveRunCount).mockReturnValue(3);

      expect(claudeCodeRunner.getActiveRunCount()).toBe(3);
    });

    it("should return 0 when no runs are active", () => {
      vi.mocked(getActiveRunCount).mockReturnValue(0);

      expect(claudeCodeRunner.getActiveRunCount()).toBe(0);
    });
  });
});

describe("getClaudeRunnerStatus", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should return disabled status when settings have enabled=false", async () => {
    vi.mocked(getClaudeSettings).mockResolvedValue({
      enabled: false,
      max_runtime_ms: 7200000,
      max_parallel_jobs: 3,
      test_command: "npm test",
    });
    vi.mocked(isClaudeCliAvailable).mockResolvedValue(true);

    const status = await getClaudeRunnerStatus();

    expect(status.type).toBe("claude-code");
    expect(status.available).toBe(false);
    expect(status.settingsEnabled).toBe(false);
    expect(status.cliInstalled).toBe(true);
    expect(status.message).toBe(CLAUDE_ERRORS.DISABLED);
    expect(status.stub).toBe(false);
    expect(status.registered).toBe(true);
  });

  it("should return CLI not found when cli is not installed", async () => {
    vi.mocked(getClaudeSettings).mockResolvedValue({
      enabled: true,
      max_runtime_ms: 7200000,
      max_parallel_jobs: 3,
      test_command: "npm test",
    });
    vi.mocked(isClaudeCliAvailable).mockResolvedValue(false);

    const status = await getClaudeRunnerStatus();

    expect(status.available).toBe(false);
    expect(status.configured).toBe(false);
    expect(status.cliInstalled).toBe(false);
    expect(status.settingsEnabled).toBe(true);
    expect(status.message).toBe(CLAUDE_ERRORS.CLI_NOT_FOUND);
  });

  it("should return ready when enabled and cli is installed", async () => {
    vi.mocked(getClaudeSettings).mockResolvedValue({
      enabled: true,
      max_runtime_ms: 7200000,
      max_parallel_jobs: 3,
      test_command: "npm test",
    });
    vi.mocked(isClaudeCliAvailable).mockResolvedValue(true);

    const status = await getClaudeRunnerStatus();

    expect(status.available).toBe(true);
    expect(status.configured).toBe(true);
    expect(status.cliInstalled).toBe(true);
    expect(status.settingsEnabled).toBe(true);
    expect(status.message).toBe("Claude Code is ready");
  });

  it("should return not available when both disabled and cli missing", async () => {
    vi.mocked(getClaudeSettings).mockResolvedValue({
      enabled: false,
      max_runtime_ms: 7200000,
      max_parallel_jobs: 3,
      test_command: "npm test",
    });
    vi.mocked(isClaudeCliAvailable).mockResolvedValue(false);

    const status = await getClaudeRunnerStatus();

    expect(status.available).toBe(false);
    expect(status.configured).toBe(false);
    // When disabled, the message is DISABLED (checked first)
    expect(status.message).toBe(CLAUDE_ERRORS.DISABLED);
  });
});
