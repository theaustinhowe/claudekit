import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the database and websocket modules before importing
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

vi.mock("./github/index.js", () => ({
  createIssueCommentForRepo: vi.fn(() => Promise.resolve({ id: 123, url: "https://github.com/test/comment" })),
  getRepoConfigById: vi.fn(() => Promise.resolve({ owner: "test-owner", name: "test-repo" })),
  AGENT_COMMENT_MARKER: "<!-- gogo-agent -->",
}));

vi.mock("./process-manager.js", () => ({
  registerProcess: vi.fn(() => Promise.resolve()),
  unregisterProcess: vi.fn(() => Promise.resolve()),
}));

// Track environment
const originalEnv = process.env;

describe("OpenAI Codex Agent (CLI)", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    process.env.ENABLE_OPENAI_CODEX = "true";
    process.env.OPENAI_API_KEY = "sk-test-key";
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  describe("isCodexCliAvailable", () => {
    it("should return a boolean", async () => {
      const { isCodexCliAvailable } = await import("./openai-codex-agent.js");
      const result = await isCodexCliAvailable();
      expect(typeof result).toBe("boolean");
    });
  });

  describe("getCodexAvailabilityError", () => {
    it("should return null when fully configured and CLI is available", async () => {
      const mod = await import("./openai-codex-agent.js");
      // Mock isCodexCliAvailable for this test
      vi.spyOn(mod, "isCodexCliAvailable").mockResolvedValue(true);

      const error = await mod.getCodexAvailabilityError();
      expect(error).toBeNull();
    });

    it("should return error when feature flag disabled", async () => {
      process.env.ENABLE_OPENAI_CODEX = undefined;

      vi.resetModules();
      const { getCodexAvailabilityError, CODEX_ERRORS } = await import("./openai-codex-agent.js");

      const error = await getCodexAvailabilityError();
      expect(error).toBe(CODEX_ERRORS.NOT_ENABLED);
    });

    it("should return error when API key not set", async () => {
      process.env.OPENAI_API_KEY = undefined;

      vi.resetModules();
      const { getCodexAvailabilityError, CODEX_ERRORS } = await import("./openai-codex-agent.js");

      const error = await getCodexAvailabilityError();
      expect(error).toBe(CODEX_ERRORS.NO_API_KEY);
    });

    it("should return CLI_NOT_FOUND error when CLI is not installed", async () => {
      // Mock child_process.execSync to simulate missing CLI
      vi.doMock("node:child_process", () => ({
        spawn: vi.fn(),
        execSync: vi.fn(() => {
          throw new Error("not found");
        }),
      }));

      vi.resetModules();
      process.env.ENABLE_OPENAI_CODEX = "true";
      process.env.OPENAI_API_KEY = "sk-test-key";

      const { getCodexAvailabilityError, CODEX_ERRORS } = await import("./openai-codex-agent.js");

      const error = await getCodexAvailabilityError();
      expect(error).toBe(CODEX_ERRORS.CLI_NOT_FOUND);

      // Restore mock
      vi.doUnmock("node:child_process");
    });
  });

  describe("parseCodexJsonlLine", () => {
    it("should return unknown for empty lines", async () => {
      const { parseCodexJsonlLine } = await import("./openai-codex-agent.js");
      expect(parseCodexJsonlLine("")).toEqual({ type: "unknown" });
      expect(parseCodexJsonlLine("  ")).toEqual({ type: "unknown" });
    });

    it("should parse thread.started events as session", async () => {
      const { parseCodexJsonlLine } = await import("./openai-codex-agent.js");
      const line = JSON.stringify({ type: "thread.started", thread_id: "thread_abc123" });
      const result = parseCodexJsonlLine(line);
      expect(result).toEqual({ type: "session", sessionId: "thread_abc123" });
    });

    it("should parse error events", async () => {
      const { parseCodexJsonlLine } = await import("./openai-codex-agent.js");
      const line = JSON.stringify({ type: "error", message: "Something went wrong" });
      const result = parseCodexJsonlLine(line);
      expect(result).toEqual({ type: "error", content: "Something went wrong" });
    });

    it("should parse item events with text content", async () => {
      const { parseCodexJsonlLine } = await import("./openai-codex-agent.js");
      const line = JSON.stringify({
        type: "item.created",
        item: {
          type: "message",
          role: "assistant",
          content: [{ type: "text", text: "Hello, I will analyze the code" }],
        },
      });
      const result = parseCodexJsonlLine(line);
      expect(result).toEqual({ type: "text", content: "Hello, I will analyze the code" });
    });

    it("should parse item events with command execution", async () => {
      const { parseCodexJsonlLine } = await import("./openai-codex-agent.js");
      const line = JSON.stringify({
        type: "item.created",
        item: {
          content: [{ type: "command", command: "ls -la" }],
        },
      });
      const result = parseCodexJsonlLine(line);
      expect(result).toEqual({ type: "tool", content: "Tool: shell (ls -la)" });
    });

    it("should parse item events with file changes", async () => {
      const { parseCodexJsonlLine } = await import("./openai-codex-agent.js");
      const line = JSON.stringify({
        type: "item.created",
        item: {
          type: "file_change",
          filename: "src/index.ts",
          action: "created",
        },
      });
      const result = parseCodexJsonlLine(line);
      expect(result).toEqual({ type: "tool", content: "Tool: file_change (created: src/index.ts)" });
    });

    it("should detect READY_TO_PR signal in text", async () => {
      const { parseCodexJsonlLine } = await import("./openai-codex-agent.js");
      const line = JSON.stringify({
        type: "item.created",
        item: {
          content: [{ type: "text", text: "All tests pass. READY_TO_PR" }],
        },
      });
      const result = parseCodexJsonlLine(line);
      expect(result.type).toBe("signal");
      expect(result.signal).toBe("READY_TO_PR");
    });

    it("should detect NEEDS_INFO signal in text", async () => {
      const { parseCodexJsonlLine } = await import("./openai-codex-agent.js");
      const line = JSON.stringify({
        type: "item.created",
        item: {
          content: [{ type: "text", text: "NEEDS_INFO: What database should I use?" }],
        },
      });
      const result = parseCodexJsonlLine(line);
      expect(result.type).toBe("signal");
      expect(result.signal).toBe("NEEDS_INFO");
      expect(result.question).toBe("What database should I use?");
    });

    it("should detect PLAN signal in text", async () => {
      const { parseCodexJsonlLine } = await import("./openai-codex-agent.js");
      const line = JSON.stringify({
        type: "item.created",
        item: {
          content: [{ type: "text", text: "PLAN:\n1. First step\n2. Second step" }],
        },
      });
      const result = parseCodexJsonlLine(line);
      expect(result.type).toBe("signal");
      expect(result.signal).toBe("PLAN");
      expect(result.planContent).toBe("1. First step\n2. Second step");
    });

    it("should handle non-JSON lines as plain text", async () => {
      const { parseCodexJsonlLine } = await import("./openai-codex-agent.js");
      const result = parseCodexJsonlLine("This is not JSON");
      expect(result).toEqual({ type: "text", content: "This is not JSON" });
    });

    it("should truncate long commands", async () => {
      const { parseCodexJsonlLine } = await import("./openai-codex-agent.js");
      const longCmd = "a".repeat(150);
      const line = JSON.stringify({
        type: "item.created",
        item: {
          content: [{ type: "command", command: longCmd }],
        },
      });
      const result = parseCodexJsonlLine(line);
      expect(result.type).toBe("tool");
      expect(result.content).toContain("...");
      expect(result.content!.length).toBeLessThan(150);
    });
  });

  describe("buildPrompt", () => {
    it("should build a standard implementation prompt", async () => {
      const { buildPrompt } = await import("./openai-codex-agent.js");
      const prompt = buildPrompt(
        {
          issueNumber: 42,
          issueTitle: "Fix login bug",
          issueBody: "Login fails on mobile",
          worktreePath: "/tmp/work",
          branch: "fix-login",
        },
        { owner: "acme", name: "app" },
        {
          enabled: true,
          max_runtime_ms: 3600000,
          max_parallel_jobs: 3,
          model: "o4-mini",
          approval_mode: "full-auto",
          test_command: "npm test",
        },
      );

      expect(prompt).toContain("Issue #42");
      expect(prompt).toContain("Fix login bug");
      expect(prompt).toContain("Login fails on mobile");
      expect(prompt).toContain("READY_TO_PR");
      expect(prompt).toContain("NEEDS_INFO");
      expect(prompt).toContain("npm test");
    });

    it("should build a planning phase prompt", async () => {
      const { buildPrompt } = await import("./openai-codex-agent.js");
      const prompt = buildPrompt(
        {
          issueNumber: 1,
          issueTitle: "Add feature",
          issueBody: null,
          worktreePath: "/tmp/work",
          branch: "feature",
        },
        { owner: "acme", name: "app" },
        {
          enabled: true,
          max_runtime_ms: 3600000,
          max_parallel_jobs: 3,
          model: "o4-mini",
          approval_mode: "full-auto",
          test_command: "npm test",
        },
        { phase: "planning" },
      );

      expect(prompt).toContain("Planning Phase");
      expect(prompt).toContain("PLAN:");
      // Planning prompt should NOT contain "Output "READY_TO_PR" when ready" instruction
      expect(prompt).not.toContain('Output "READY_TO_PR" when ready');
    });

    it("should build a prompt with an approved plan", async () => {
      const { buildPrompt } = await import("./openai-codex-agent.js");
      const prompt = buildPrompt(
        {
          issueNumber: 1,
          issueTitle: "Add feature",
          issueBody: null,
          worktreePath: "/tmp/work",
          branch: "feature",
        },
        { owner: "acme", name: "app" },
        {
          enabled: true,
          max_runtime_ms: 3600000,
          max_parallel_jobs: 3,
          model: "o4-mini",
          approval_mode: "full-auto",
          test_command: "npm test",
        },
        { phase: "implementing_with_plan", approvedPlan: "1. Do X\n2. Do Y" },
      );

      expect(prompt).toContain("Approved Implementation Plan");
      expect(prompt).toContain("1. Do X");
    });

    it("should use Task header for manual jobs", async () => {
      const { buildPrompt } = await import("./openai-codex-agent.js");
      const prompt = buildPrompt(
        {
          issueNumber: -1,
          issueTitle: "Manual task",
          issueBody: null,
          worktreePath: "/tmp/work",
          branch: "manual",
          source: "manual",
        },
        { owner: "acme", name: "app" },
        {
          enabled: true,
          max_runtime_ms: 3600000,
          max_parallel_jobs: 3,
          model: "o4-mini",
          approval_mode: "full-auto",
          test_command: "npm test",
        },
      );

      expect(prompt).toContain("## Task: Manual task");
      expect(prompt).not.toContain("Issue #");
    });
  });

  describe("isRunning and getActiveRunCount", () => {
    it("should report no active runs initially", async () => {
      const { isRunning, getActiveRunCount } = await import("./openai-codex-agent.js");

      expect(isRunning("any-job")).toBe(false);
      expect(getActiveRunCount()).toBe(0);
    });
  });

  describe("stopCodexRun", () => {
    it("should return false when no run exists", async () => {
      const { stopCodexRun } = await import("./openai-codex-agent.js");

      const result = await stopCodexRun("nonexistent-job");
      expect(result).toBe(false);
    });
  });

  describe("pauseCodexRun", () => {
    it("should return false when no run exists", async () => {
      const { pauseCodexRun } = await import("./openai-codex-agent.js");

      const result = await pauseCodexRun("nonexistent-job");
      expect(result).toBe(false);
    });
  });

  describe("injectCodexMessage", () => {
    it("should store pending injection when not running", async () => {
      const { queryOne, execute: executeMock } = await import("../db/helpers.js");
      vi.mocked(queryOne).mockResolvedValue({
        id: "test-job",
        status: "running",
        repository_id: "repo-1",
      });
      vi.mocked(executeMock).mockResolvedValue(undefined);

      const { injectCodexMessage } = await import("./openai-codex-agent.js");

      const result = await injectCodexMessage("test-job", "Please also add tests", "queued");
      expect(result.success).toBe(true);
    });
  });

  describe("CODEX_ERRORS", () => {
    it("should have CLI_NOT_FOUND error constant", async () => {
      const { CODEX_ERRORS } = await import("./openai-codex-agent.js");

      expect(CODEX_ERRORS.CLI_NOT_FOUND).toContain("Codex CLI not found");
      expect(CODEX_ERRORS.NOT_ENABLED).toContain("not enabled");
      expect(CODEX_ERRORS.NO_API_KEY).toContain("OPENAI_API_KEY");
    });
  });
});
