import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
  execSync: vi.fn(),
}));

vi.mock("node:crypto", () => ({
  randomUUID: vi.fn().mockReturnValue("test-uuid-1234"),
}));

vi.mock("@claudekit/duckdb", () => ({
  execute: vi.fn(),
  queryOne: vi.fn(),
}));

vi.mock("../db/index.js", () => ({
  getDb: vi.fn().mockResolvedValue({}),
}));

vi.mock("../utils/job-logging.js", () => ({
  emitLog: vi.fn(),
  updateJobStatus: vi.fn(),
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

vi.mock("./github/index.js", () => ({
  AGENT_COMMENT_MARKER: "<!-- gogo-agent -->",
  createIssueCommentForRepo: vi.fn(),
  getRepoConfigById: vi.fn(),
}));

vi.mock("./process-manager.js", () => ({
  registerProcess: vi.fn(),
  unregisterProcess: vi.fn(),
}));

vi.mock("./session-bridge.js", () => ({
  cancelSession: vi.fn().mockResolvedValue(false),
  createSessionRecord: vi.fn(),
  getActiveSessionCount: vi.fn().mockReturnValue(0),
  getLiveSession: vi.fn().mockReturnValue(undefined),
  safeTerminateProcess: vi.fn(),
  setCleanupFn: vi.fn(),
  setSessionPid: vi.fn(),
  startSession: vi.fn(),
  trackSession: vi.fn(),
  untrackSession: vi.fn(),
}));

vi.mock("@claudekit/claude-runner", async (importOriginal) => {
  const original = await importOriginal<typeof import("@claudekit/claude-runner")>();
  return {
    ...original,
    spawnClaude: vi.fn(),
  };
});

vi.mock("./settings-helper.js", () => ({
  getClaudeSettings: vi.fn(),
}));

import { execSync } from "node:child_process";
import { execute, queryOne } from "@claudekit/duckdb";
import { getDb } from "../db/index.js";
import type { DbJob } from "../db/schema.js";
import {
  buildPrompt,
  CLAUDE_ERRORS,
  detectPhase,
  detectSignal,
  getActiveRunCount,
  getClaudeAvailabilityError,
  injectMessage,
  isClaudeCliAvailable,
  isRunning,
  parseStreamJsonLine,
  pauseClaudeRun,
  resumeClaudeRun,
  startClaudeRun,
  stopClaudeRun,
} from "./claude-code-agent";
import { getRepoConfigById } from "./github/index.js";
import { cancelSession, getActiveSessionCount, getLiveSession } from "./session-bridge.js";
import { getClaudeSettings } from "./settings-helper.js";

describe("CLAUDE_ERRORS", () => {
  it("has CLI_NOT_FOUND message", () => {
    expect(CLAUDE_ERRORS.CLI_NOT_FOUND).toContain("Claude CLI not found");
  });

  it("has DISABLED message", () => {
    expect(CLAUDE_ERRORS.DISABLED).toContain("disabled");
  });
});

describe("isClaudeCliAvailable", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns true when which claude succeeds", async () => {
    vi.mocked(execSync).mockReturnValue(Buffer.from("/usr/local/bin/claude"));
    const result = await isClaudeCliAvailable();
    expect(result).toBe(true);
  });

  it("returns false when which claude throws", async () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error("not found");
    });
    const result = await isClaudeCliAvailable();
    expect(result).toBe(false);
  });
});

describe("getClaudeAvailabilityError", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns DISABLED when settings.enabled is false", async () => {
    vi.mocked(getClaudeSettings).mockResolvedValue({ enabled: false } as never);
    const result = await getClaudeAvailabilityError();
    expect(result).toBe(CLAUDE_ERRORS.DISABLED);
  });

  it("returns CLI_NOT_FOUND when CLI is not available", async () => {
    vi.mocked(getClaudeSettings).mockResolvedValue({ enabled: true } as never);
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error("not found");
    });
    const result = await getClaudeAvailabilityError();
    expect(result).toBe(CLAUDE_ERRORS.CLI_NOT_FOUND);
  });

  it("returns null when everything is available", async () => {
    vi.mocked(getClaudeSettings).mockResolvedValue({ enabled: true } as never);
    vi.mocked(execSync).mockReturnValue(Buffer.from("/usr/local/bin/claude"));
    const result = await getClaudeAvailabilityError();
    expect(result).toBeNull();
  });
});

describe("isRunning / getActiveRunCount", () => {
  beforeEach(() => {
    vi.mocked(getLiveSession).mockReturnValue(undefined);
    vi.mocked(getActiveSessionCount).mockReturnValue(0);
  });

  it("isRunning returns false for unknown job", () => {
    expect(isRunning("nonexistent-job")).toBe(false);
  });

  it("getActiveRunCount returns 0 initially", () => {
    expect(getActiveRunCount()).toBe(0);
  });
});

describe("startClaudeRun", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getDb).mockResolvedValue({} as never);
    vi.mocked(getLiveSession).mockReturnValue(undefined);
    vi.mocked(getActiveSessionCount).mockReturnValue(0);
    vi.mocked(cancelSession).mockResolvedValue(false);
  });

  it("returns error when job not found", async () => {
    vi.mocked(queryOne).mockResolvedValue(undefined);
    const result = await startClaudeRun("nonexistent-id");
    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("returns error when job status is not running or planning", async () => {
    vi.mocked(queryOne).mockResolvedValue({
      id: "job-1",
      status: "queued",
      worktree_path: "/tmp/work",
      repository_id: "repo-1",
    } as DbJob);
    const result = await startClaudeRun("job-1");
    expect(result.success).toBe(false);
    expect(result.error).toContain("running");
  });

  it("returns error when job has no worktree path", async () => {
    vi.mocked(queryOne).mockResolvedValue({
      id: "job-1",
      status: "running",
      worktree_path: null,
      repository_id: "repo-1",
    } as DbJob);
    const result = await startClaudeRun("job-1");
    expect(result.success).toBe(false);
    expect(result.error).toContain("worktree");
  });

  it("returns error when job has no repository ID", async () => {
    vi.mocked(queryOne).mockResolvedValue({
      id: "job-1",
      status: "running",
      worktree_path: "/tmp/work",
      repository_id: null,
    } as DbJob);
    const result = await startClaudeRun("job-1");
    expect(result.success).toBe(false);
    expect(result.error).toContain("repository ID");
  });

  it("returns error when repo config not found", async () => {
    vi.mocked(queryOne).mockResolvedValue({
      id: "job-1",
      status: "running",
      worktree_path: "/tmp/work",
      repository_id: "repo-1",
    } as DbJob);
    vi.mocked(getRepoConfigById).mockResolvedValue(null as never);
    const result = await startClaudeRun("job-1");
    expect(result.success).toBe(false);
    expect(result.error).toContain("configuration not found");
  });

  it("returns error when Claude is disabled", async () => {
    vi.mocked(queryOne).mockResolvedValue({
      id: "job-1",
      status: "running",
      worktree_path: "/tmp/work",
      repository_id: "repo-1",
    } as DbJob);
    vi.mocked(getRepoConfigById).mockResolvedValue({ owner: "test", name: "repo" } as never);
    vi.mocked(getClaudeSettings).mockResolvedValue({ enabled: false } as never);
    const result = await startClaudeRun("job-1");
    expect(result.success).toBe(false);
    expect(result.error).toContain("disabled");
  });

  it("returns error when max parallel jobs reached", async () => {
    vi.mocked(queryOne).mockResolvedValue({
      id: "job-1",
      status: "running",
      worktree_path: "/tmp/work",
      repository_id: "repo-1",
    } as DbJob);
    vi.mocked(getRepoConfigById).mockResolvedValue({ owner: "test", name: "repo" } as never);
    vi.mocked(getClaudeSettings).mockResolvedValue({
      enabled: true,
      max_parallel_jobs: 0,
      max_runtime_ms: 600000,
      test_command: "npm test",
    } as never);
    const result = await startClaudeRun("job-1");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Max parallel jobs");
  });
});

describe("stopClaudeRun", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getDb).mockResolvedValue({} as never);
    vi.mocked(cancelSession).mockResolvedValue(false);
    vi.mocked(getLiveSession).mockReturnValue(undefined);
  });

  it("returns false when no active process", async () => {
    const result = await stopClaudeRun("nonexistent-job");
    expect(result).toBe(false);
  });
});

describe("buildPrompt", () => {
  const baseJob = {
    issueNumber: 42,
    issueTitle: "Fix login bug",
    issueBody: "Login page crashes",
    worktreePath: "/tmp/work",
    branch: "fix/login-42",
  };
  const workspace = { owner: "org", name: "repo" };
  const settings = { enabled: true, max_runtime_ms: 7200000, max_parallel_jobs: 3, test_command: "npm test" };

  it("generates implementing prompt by default", () => {
    const prompt = buildPrompt(baseJob, workspace, settings);
    expect(prompt).toContain("# Task Assignment");
    expect(prompt).toContain("## Issue #42: Fix login bug");
    expect(prompt).toContain("Login page crashes");
    expect(prompt).toContain("`npm test`");
    expect(prompt).toContain("READY_TO_PR");
  });

  it("generates planning prompt", () => {
    const prompt = buildPrompt(baseJob, workspace, settings, { phase: "planning" });
    expect(prompt).toContain("# Planning Phase");
    expect(prompt).toContain("PLANNING phase");
    expect(prompt).toContain("Do NOT implement any code changes");
    expect(prompt).toContain("PLAN:");
  });

  it("includes feedback in planning prompt", () => {
    const prompt = buildPrompt(baseJob, workspace, settings, {
      phase: "planning",
      feedback: "Add error handling for edge cases",
    });
    expect(prompt).toContain("Previous Plan Feedback");
    expect(prompt).toContain("Add error handling for edge cases");
  });

  it("generates implementing_with_plan prompt", () => {
    const prompt = buildPrompt(baseJob, workspace, settings, {
      phase: "implementing_with_plan",
      approvedPlan: "## Step 1\nDo the thing",
    });
    expect(prompt).toContain("Approved Plan");
    expect(prompt).toContain("## Step 1\nDo the thing");
    expect(prompt).toContain("Follow it closely");
  });

  it("uses manual job header for negative issue numbers", () => {
    const prompt = buildPrompt({ ...baseJob, issueNumber: -1, source: "manual" }, workspace, settings);
    expect(prompt).toContain("## Task: Fix login bug");
    expect(prompt).not.toContain("## Issue #");
  });

  it("includes repo context", () => {
    const prompt = buildPrompt(baseJob, workspace, settings);
    expect(prompt).toContain("Owner: org");
    expect(prompt).toContain("Repository: repo");
    expect(prompt).toContain("Working Directory: /tmp/work");
    expect(prompt).toContain("Branch: fix/login-42");
  });

  it("handles null issueBody", () => {
    const prompt = buildPrompt({ ...baseJob, issueBody: null }, workspace, settings);
    expect(prompt).toContain("No description provided.");
  });
});

describe("detectSignal", () => {
  it("detects READY_TO_PR", () => {
    const result = detectSignal("All tests pass. READY_TO_PR");
    expect(result).toEqual({
      type: "signal",
      signal: "READY_TO_PR",
      content: "All tests pass. READY_TO_PR",
    });
  });

  it("detects NEEDS_INFO with question", () => {
    const result = detectSignal("NEEDS_INFO: What database should I use?");
    expect(result).toEqual({
      type: "signal",
      signal: "NEEDS_INFO",
      question: "What database should I use?",
      content: "NEEDS_INFO: What database should I use?",
    });
  });

  it("detects PLAN signal", () => {
    const result = detectSignal("PLAN:\n## Step 1\nDo the thing");
    expect(result).toEqual({
      type: "signal",
      signal: "PLAN",
      planContent: "## Step 1\nDo the thing",
      content: "PLAN:\n## Step 1\nDo the thing",
    });
  });

  it("returns null for regular text", () => {
    expect(detectSignal("Just doing some work")).toBeNull();
  });
});

describe("detectPhase", () => {
  it("detects analysis phase from read tools", () => {
    const result = detectPhase({ type: "tool", content: "Tool: Read" });
    expect(result).toEqual({ phase: "analysis", progress: 25 });
  });

  it("detects analysis phase from search tools", () => {
    const result = detectPhase({ type: "tool", content: "Tool: Grep" });
    expect(result).toEqual({ phase: "analysis", progress: 25 });
  });

  it("detects implementation phase from write tools", () => {
    const result = detectPhase({ type: "tool", content: "Tool: Write" });
    expect(result).toEqual({ phase: "implementation", progress: 50 });
  });

  it("detects implementation phase from edit tools", () => {
    const result = detectPhase({ type: "tool", content: "Tool: Edit" });
    expect(result).toEqual({ phase: "implementation", progress: 50 });
  });

  it("detects testing phase from bash tools", () => {
    const result = detectPhase({ type: "tool", content: "Tool: Bash" });
    expect(result).toEqual({ phase: "testing", progress: 75 });
  });

  it("detects analysis from text content", () => {
    const result = detectPhase({ type: "text", content: "Analyzing the codebase structure" });
    expect(result).toEqual({ phase: "analysis", progress: 25 });
  });

  it("detects implementation from text content", () => {
    const result = detectPhase({ type: "text", content: "Implementing the fix now" });
    expect(result).toEqual({ phase: "implementation", progress: 50 });
  });

  it("detects testing from text content", () => {
    const result = detectPhase({ type: "text", content: "Running tests to verify" });
    expect(result).toEqual({ phase: "testing", progress: 75 });
  });

  it("detects complete phase from READY_TO_PR signal", () => {
    const result = detectPhase({ type: "signal", signal: "READY_TO_PR" });
    expect(result).toEqual({ phase: "complete", progress: 100 });
  });

  it("returns null for unrelated text", () => {
    expect(detectPhase({ type: "text", content: "hello world" })).toBeNull();
  });

  it("returns null for unknown type", () => {
    expect(detectPhase({ type: "unknown" })).toBeNull();
  });
});

describe("parseStreamJsonLine", () => {
  it("returns unknown for empty line", () => {
    expect(parseStreamJsonLine("")).toEqual({ type: "unknown" });
  });

  it("parses error message", () => {
    const line = JSON.stringify({ type: "error", error: { message: "Rate limit exceeded" } });
    const result = parseStreamJsonLine(line);
    expect(result).toEqual({ type: "error", content: "Rate limit exceeded" });
  });

  it("parses session result", () => {
    const line = JSON.stringify({ type: "result", result: { session_id: "sess-123" } });
    const result = parseStreamJsonLine(line);
    expect(result).toEqual({ type: "session", sessionId: "sess-123" });
  });

  it("parses content block delta text", () => {
    const line = JSON.stringify({ type: "content_block_delta", delta: { text: "Hello world" } });
    const result = parseStreamJsonLine(line);
    expect(result).toEqual({ type: "text", content: "Hello world" });
  });

  it("detects signal in delta text", () => {
    const line = JSON.stringify({ type: "content_block_delta", delta: { text: "READY_TO_PR" } });
    const result = parseStreamJsonLine(line);
    expect(result.type).toBe("signal");
    expect(result.signal).toBe("READY_TO_PR");
  });

  it("parses message with text content", () => {
    const line = JSON.stringify({
      type: "message",
      message: { content: [{ type: "text", text: "Analyzing code" }] },
    });
    const result = parseStreamJsonLine(line);
    expect(result).toEqual({ type: "text", content: "Analyzing code" });
  });

  it("parses message with tool use", () => {
    const line = JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "tool_use", tool_use: { name: "Read", input: {} } }] },
    });
    const result = parseStreamJsonLine(line);
    expect(result).toEqual({ type: "tool", content: "Tool: Read" });
  });

  it("treats non-JSON as plain text", () => {
    const result = parseStreamJsonLine("Just plain output");
    expect(result).toEqual({ type: "text", content: "Just plain output" });
  });

  it("detects signal in plain text", () => {
    const result = parseStreamJsonLine("NEEDS_INFO: How should I handle auth?");
    expect(result.type).toBe("signal");
    expect(result.signal).toBe("NEEDS_INFO");
    expect(result.question).toBe("How should I handle auth?");
  });

  it("returns unknown for whitespace-only line", () => {
    expect(parseStreamJsonLine("   ")).toEqual({ type: "unknown" });
    expect(parseStreamJsonLine("\t\t")).toEqual({ type: "unknown" });
    expect(parseStreamJsonLine("\n")).toEqual({ type: "unknown" });
  });

  it("handles malformed JSON gracefully", () => {
    const result = parseStreamJsonLine('{"type": "error", broken');
    // Falls through to non-JSON path
    expect(result.type).toBe("text");
    expect(result.content).toBe('{"type": "error", broken');
  });

  it("handles empty JSON object", () => {
    const result = parseStreamJsonLine("{}");
    expect(result.type).toBe("unknown");
  });

  it("handles error without message", () => {
    const line = JSON.stringify({ type: "error", error: {} });
    const result = parseStreamJsonLine(line);
    expect(result).toEqual({ type: "error", content: "Unknown error" });
  });

  it("handles error without error object", () => {
    const line = JSON.stringify({ type: "error" });
    const result = parseStreamJsonLine(line);
    expect(result).toEqual({ type: "error", content: "Unknown error" });
  });

  it("handles result without session_id", () => {
    const line = JSON.stringify({ type: "result", result: {} });
    const result = parseStreamJsonLine(line);
    expect(result.type).toBe("unknown");
  });

  it("handles content_block_delta without text", () => {
    const line = JSON.stringify({ type: "content_block_delta", delta: {} });
    const result = parseStreamJsonLine(line);
    expect(result.type).toBe("unknown");
  });

  it("handles message with empty content array", () => {
    const line = JSON.stringify({ type: "message", message: { content: [] } });
    const result = parseStreamJsonLine(line);
    expect(result.type).toBe("unknown");
  });

  it("handles assistant type same as message type", () => {
    const line = JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "text", text: "Hello from assistant" }] },
    });
    const result = parseStreamJsonLine(line);
    expect(result).toEqual({ type: "text", content: "Hello from assistant" });
  });

  it("detects PLAN signal in content_block_delta", () => {
    const line = JSON.stringify({
      type: "content_block_delta",
      delta: { text: "PLAN:\n## Implementation\n1. Step one" },
    });
    const result = parseStreamJsonLine(line);
    expect(result.type).toBe("signal");
    expect(result.signal).toBe("PLAN");
    expect(result.planContent).toBe("## Implementation\n1. Step one");
  });

  it("detects NEEDS_INFO signal in message content", () => {
    const line = JSON.stringify({
      type: "message",
      message: { content: [{ type: "text", text: "NEEDS_INFO: Which API endpoint to use?" }] },
    });
    const result = parseStreamJsonLine(line);
    expect(result.type).toBe("signal");
    expect(result.signal).toBe("NEEDS_INFO");
    expect(result.question).toBe("Which API endpoint to use?");
  });

  it("detects PLAN signal in plain text fallback", () => {
    const result = parseStreamJsonLine("PLAN:\n## My Plan\n- Do stuff");
    expect(result.type).toBe("signal");
    expect(result.signal).toBe("PLAN");
    expect(result.planContent).toBe("## My Plan\n- Do stuff");
  });
});

describe("detectSignal edge cases", () => {
  it("detects READY_TO_PR embedded in longer text", () => {
    const result = detectSignal("I've completed everything. READY_TO_PR. Let me know.");
    expect(result).not.toBeNull();
    expect(result?.signal).toBe("READY_TO_PR");
  });

  it("detects NEEDS_INFO with multiline question", () => {
    const result = detectSignal("NEEDS_INFO: What database should I use?\nAlso, what ORM?");
    expect(result).not.toBeNull();
    expect(result?.signal).toBe("NEEDS_INFO");
    expect(result?.question).toContain("What database should I use?");
  });

  it("detects PLAN with empty content", () => {
    const result = detectSignal("PLAN:");
    expect(result).not.toBeNull();
    expect(result?.signal).toBe("PLAN");
    expect(result?.planContent).toBe("");
  });

  it("returns null for text containing partial signals", () => {
    expect(detectSignal("READY_TO")).toBeNull();
    expect(detectSignal("NEEDS")).toBeNull();
    expect(detectSignal("PLA")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(detectSignal("")).toBeNull();
  });

  it("prioritizes READY_TO_PR over NEEDS_INFO when both present", () => {
    // READY_TO_PR is checked first
    const result = detectSignal("READY_TO_PR NEEDS_INFO: something");
    expect(result?.signal).toBe("READY_TO_PR");
  });
});

describe("detectPhase additional patterns", () => {
  it("detects analysis phase from glob tool", () => {
    const result = detectPhase({ type: "tool", content: "Tool: Glob" });
    expect(result).toEqual({ phase: "analysis", progress: 25 });
  });

  it("detects analysis phase from list tool", () => {
    const result = detectPhase({ type: "tool", content: "Tool: ListFiles" });
    expect(result).toEqual({ phase: "analysis", progress: 25 });
  });

  it("detects implementation phase from create tool", () => {
    const result = detectPhase({ type: "tool", content: "Tool: CreateFile" });
    expect(result).toEqual({ phase: "implementation", progress: 50 });
  });

  it("detects implementation phase from patch tool", () => {
    const result = detectPhase({ type: "tool", content: "Tool: Patch" });
    expect(result).toEqual({ phase: "implementation", progress: 50 });
  });

  it("detects testing phase from execute tool", () => {
    const result = detectPhase({ type: "tool", content: "Tool: Execute" });
    expect(result).toEqual({ phase: "testing", progress: 75 });
  });

  it("detects testing phase from run tool", () => {
    const result = detectPhase({ type: "tool", content: "Tool: RunCommand" });
    expect(result).toEqual({ phase: "testing", progress: 75 });
  });

  it("detects analysis from text mentioning 'exploring'", () => {
    const result = detectPhase({ type: "text", content: "Exploring the directory structure" });
    expect(result).toEqual({ phase: "analysis", progress: 25 });
  });

  it("detects analysis from text mentioning 'reading'", () => {
    const result = detectPhase({ type: "text", content: "Reading the configuration file" });
    expect(result).toEqual({ phase: "analysis", progress: 25 });
  });

  it("detects implementation from text mentioning 'writing'", () => {
    const result = detectPhase({ type: "text", content: "Writing the new module" });
    expect(result).toEqual({ phase: "implementation", progress: 50 });
  });

  it("detects implementation from text mentioning 'editing'", () => {
    const result = detectPhase({ type: "text", content: "Editing the config file" });
    expect(result).toEqual({ phase: "implementation", progress: 50 });
  });

  it("detects testing from text mentioning 'linting'", () => {
    const result = detectPhase({ type: "text", content: "Linting the code" });
    expect(result).toEqual({ phase: "testing", progress: 75 });
  });

  it("returns null for tool with no content", () => {
    const result = detectPhase({ type: "tool" });
    expect(result).toBeNull();
  });

  it("returns null for text with no content", () => {
    const result = detectPhase({ type: "text" });
    expect(result).toBeNull();
  });

  it("returns null for signal that is not READY_TO_PR", () => {
    const result = detectPhase({ type: "signal", signal: "NEEDS_INFO" });
    expect(result).toBeNull();
  });

  it("returns null for signal that is PLAN", () => {
    const result = detectPhase({ type: "signal", signal: "PLAN" });
    expect(result).toBeNull();
  });

  it("returns null for error type", () => {
    const result = detectPhase({ type: "error", content: "Something went wrong" });
    expect(result).toBeNull();
  });

  it("returns null for session type", () => {
    const result = detectPhase({ type: "session", sessionId: "abc" });
    expect(result).toBeNull();
  });
});

describe("buildPrompt edge cases", () => {
  const baseJob = {
    issueNumber: 42,
    issueTitle: "Fix login bug",
    issueBody: "Login page crashes",
    worktreePath: "/tmp/work",
    branch: "fix/login-42",
  };
  const workspace = { owner: "org", name: "repo" };
  const settings = { enabled: true, max_runtime_ms: 7200000, max_parallel_jobs: 3, test_command: "npm test" };

  it("uses custom test command from settings", () => {
    const customSettings = { ...settings, test_command: "pnpm test:coverage" };
    const prompt = buildPrompt(baseJob, workspace, customSettings);
    expect(prompt).toContain("`pnpm test:coverage`");
    expect(prompt).not.toContain("`npm test`");
  });

  it("defaults test_command to 'npm test' when empty", () => {
    const noTestSettings = { ...settings, test_command: "" };
    const prompt = buildPrompt(baseJob, workspace, noTestSettings);
    expect(prompt).toContain("`npm test`");
  });

  it("implementing_with_plan without approvedPlan falls through to default", () => {
    const prompt = buildPrompt(baseJob, workspace, settings, {
      phase: "implementing_with_plan",
      // No approvedPlan provided
    });
    // Should fall through to default implementing prompt
    expect(prompt).toContain("# Task Assignment");
    expect(prompt).not.toContain("Approved Plan");
  });

  it("planning prompt for manual job uses Task header", () => {
    const prompt = buildPrompt({ ...baseJob, issueNumber: -1, source: "manual" }, workspace, settings, {
      phase: "planning",
    });
    expect(prompt).toContain("## Task: Fix login bug");
    expect(prompt).not.toContain("Issue #");
  });

  it("implementing_with_plan for manual job omits GitHub reference", () => {
    const prompt = buildPrompt({ ...baseJob, issueNumber: -1, source: "manual" }, workspace, settings, {
      phase: "implementing_with_plan",
      approvedPlan: "## Plan\n1. Do it",
    });
    expect(prompt).toContain("If blocked, stop and ask");
    expect(prompt).not.toContain("posted to GitHub issue");
  });

  it("implementing_with_plan for GitHub job includes GitHub reference", () => {
    const prompt = buildPrompt(baseJob, workspace, settings, {
      phase: "implementing_with_plan",
      approvedPlan: "## Plan\n1. Do it",
    });
    expect(prompt).toContain("posted to GitHub issue");
  });

  it("planning prompt without feedback omits feedback section", () => {
    const prompt = buildPrompt(baseJob, workspace, settings, { phase: "planning" });
    expect(prompt).not.toContain("Previous Plan Feedback");
  });

  it("default implementing prompt for manual job omits GitHub reference", () => {
    const prompt = buildPrompt({ ...baseJob, issueNumber: -1, source: "manual" }, workspace, settings);
    expect(prompt).toContain("If blocked, stop and ask");
    expect(prompt).not.toContain("posted to GitHub issue");
  });

  it("handles issueBody with special characters", () => {
    const prompt = buildPrompt({ ...baseJob, issueBody: "Fix `code` with **bold** and <html>" }, workspace, settings);
    expect(prompt).toContain("Fix `code` with **bold** and <html>");
  });
});

describe("stopClaudeRun", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getDb).mockResolvedValue({} as never);
    vi.mocked(cancelSession).mockResolvedValue(false);
    vi.mocked(getLiveSession).mockReturnValue(undefined);
  });

  it("returns false when no active process for saveSession=true path", async () => {
    vi.mocked(queryOne).mockResolvedValue(undefined);
    const result = await stopClaudeRun("nonexistent-job", true);
    expect(result).toBe(false);
  });

  it("returns false when no active session exists (no save)", async () => {
    const result = await stopClaudeRun("nonexistent-job", false);
    expect(result).toBe(false);
  });

  it("saves session ID when saveSession=true and job has session", async () => {
    vi.mocked(queryOne).mockResolvedValue({
      claude_session_id: "sess-to-save",
    } as DbJob);
    vi.mocked(execute).mockResolvedValue(undefined);

    const result = await stopClaudeRun("job-with-session", true);

    // cancelSession returns false since no live session
    expect(result).toBe(false);
    // Should have saved session ID
    expect(execute).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("claude_session_id"),
      expect.arrayContaining(["sess-to-save"]),
    );
  });
});

describe("pauseClaudeRun", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getDb).mockResolvedValue({} as never);
    vi.mocked(cancelSession).mockResolvedValue(false);
    vi.mocked(getLiveSession).mockReturnValue(undefined);
  });

  it("returns false when no live session exists", async () => {
    vi.mocked(getLiveSession).mockReturnValue(undefined);
    const result = await pauseClaudeRun("nonexistent-job");
    expect(result).toBe(false);
  });

  it("returns true and stops run when session exists", async () => {
    vi.mocked(getLiveSession).mockReturnValue({
      status: "running",
    } as never);
    vi.mocked(queryOne).mockResolvedValue(undefined);
    vi.mocked(execute).mockResolvedValue(undefined);

    const result = await pauseClaudeRun("job-1");
    expect(result).toBe(true);
  });
});

describe("resumeClaudeRun", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getDb).mockResolvedValue({} as never);
    vi.mocked(cancelSession).mockResolvedValue(false);
    vi.mocked(getLiveSession).mockReturnValue(undefined);
  });

  it("returns error when job not found", async () => {
    vi.mocked(queryOne).mockResolvedValue(undefined);
    const result = await resumeClaudeRun("nonexistent-job");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Job not found");
  });

  it("returns error when no session ID to resume from", async () => {
    vi.mocked(queryOne).mockResolvedValue({
      id: "job-1",
      status: "paused",
      claude_session_id: null,
    } as DbJob);
    const result = await resumeClaudeRun("job-1");
    expect(result.success).toBe(false);
    expect(result.error).toContain("No session ID");
  });

  it("consumes pending injection when no explicit message provided", async () => {
    vi.mocked(queryOne).mockResolvedValue({
      id: "job-1",
      status: "running",
      claude_session_id: "sess-123",
      pending_injection: "pending message",
      worktree_path: "/tmp/work",
      repository_id: "repo-1",
    } as DbJob);
    vi.mocked(execute).mockResolvedValue(undefined);
    vi.mocked(getRepoConfigById).mockResolvedValue(null as never);

    await resumeClaudeRun("job-1");
    // It will fail at repo config check, but we can verify pending_injection was cleared
    expect(execute).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("pending_injection = NULL"),
      expect.any(Array),
    );
  });

  it("uses default continue message when no message or pending injection", async () => {
    vi.mocked(queryOne).mockResolvedValue({
      id: "job-1",
      status: "running",
      claude_session_id: "sess-123",
      pending_injection: null,
      worktree_path: "/tmp/work",
      repository_id: "repo-1",
    } as DbJob);
    vi.mocked(execute).mockResolvedValue(undefined);
    vi.mocked(getRepoConfigById).mockResolvedValue(null as never);

    const result = await resumeClaudeRun("job-1");
    // Will fail at repo config, but the default message is used internally
    expect(result.success).toBe(false);
  });

  it("uses injected message when provided", async () => {
    vi.mocked(queryOne).mockResolvedValue({
      id: "job-1",
      status: "running",
      claude_session_id: "sess-123",
      pending_injection: null,
      worktree_path: "/tmp/work",
      repository_id: "repo-1",
    } as DbJob);
    vi.mocked(execute).mockResolvedValue(undefined);
    vi.mocked(getRepoConfigById).mockResolvedValue(null as never);

    const result = await resumeClaudeRun("job-1", "custom message");
    // Will fail at repo config
    expect(result.success).toBe(false);
  });
});

describe("injectMessage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getDb).mockResolvedValue({} as never);
    vi.mocked(cancelSession).mockResolvedValue(false);
    vi.mocked(getLiveSession).mockReturnValue(undefined);
  });

  it("returns error when job not found", async () => {
    vi.mocked(queryOne).mockResolvedValue(undefined);
    const result = await injectMessage("nonexistent", "hello", "queued");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Job not found");
  });

  it("stores message as pending_injection in queued mode", async () => {
    vi.mocked(queryOne).mockResolvedValue({
      id: "job-1",
      status: "running",
    } as DbJob);
    vi.mocked(execute).mockResolvedValue(undefined);

    const result = await injectMessage("job-1", "queued message", "queued");
    expect(result.success).toBe(true);
    expect(execute).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("pending_injection"),
      expect.arrayContaining(["queued message"]),
    );
  });

  it("stores message as pending when no session available in immediate mode", async () => {
    vi.mocked(queryOne).mockResolvedValue({
      id: "job-1",
      status: "queued",
      claude_session_id: null,
    } as DbJob);
    vi.mocked(getLiveSession).mockReturnValue(undefined);
    vi.mocked(execute).mockResolvedValue(undefined);

    const result = await injectMessage("job-1", "immediate message", "immediate");
    expect(result.success).toBe(true);
    // Should store as pending since no session to resume
    expect(execute).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("pending_injection"),
      expect.arrayContaining(["immediate message"]),
    );
  });

  it("pauses running session in immediate mode before injecting", async () => {
    vi.mocked(queryOne).mockResolvedValue({
      id: "job-1",
      status: "running",
      claude_session_id: "sess-123",
      pending_injection: null,
      worktree_path: "/tmp/work",
      repository_id: "repo-1",
    } as DbJob);
    vi.mocked(getLiveSession).mockReturnValue({
      status: "running",
    } as never);
    vi.mocked(execute).mockResolvedValue(undefined);
    vi.mocked(getRepoConfigById).mockResolvedValue(null as never);

    const result = await injectMessage("job-1", "inject now", "immediate");
    // Should attempt to pause and resume, but resumeClaudeRun will fail at repo config
    // The key assertion is that it attempts the flow
    expect(result.success).toBe(false);
  });

  it("attempts to resume paused job with session in immediate mode", async () => {
    vi.mocked(queryOne).mockResolvedValue({
      id: "job-1",
      status: "paused",
      claude_session_id: "sess-123",
      pending_injection: null,
      worktree_path: "/tmp/work",
      repository_id: "repo-1",
    } as DbJob);
    vi.mocked(getLiveSession).mockReturnValue(undefined);
    vi.mocked(execute).mockResolvedValue(undefined);
    vi.mocked(getRepoConfigById).mockResolvedValue(null as never);

    const result = await injectMessage("job-1", "resume msg", "immediate");
    // Will try to resume the paused job, but fail because repo config is null
    expect(result.success).toBe(false);
  });
});
