import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
  execSync: vi.fn(),
}));

vi.mock("node:crypto", () => ({
  randomUUID: vi.fn().mockReturnValue("test-uuid-1234"),
}));

vi.mock("@devkit/duckdb", () => ({
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

vi.mock("./settings-helper.js", () => ({
  getClaudeSettings: vi.fn(),
}));

import { execSync } from "node:child_process";
import { queryOne } from "@devkit/duckdb";
import type { DbJob } from "../db/schema.js";
import {
  buildPrompt,
  CLAUDE_ERRORS,
  detectPhase,
  detectSignal,
  getActiveRunCount,
  getClaudeAvailabilityError,
  isClaudeCliAvailable,
  isRunning,
  parseStreamJsonLine,
  startClaudeRun,
  stopClaudeRun,
} from "./claude-code-agent";
import { getRepoConfigById } from "./github/index.js";
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
});
