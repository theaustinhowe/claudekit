import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the database and websocket modules before importing
vi.mock("../../db/index.js", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve([])),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => Promise.resolve()),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve([{ id: "test-job" }])),
        })),
      })),
    })),
  },
}));

vi.mock("../../ws/handler.js", () => ({
  broadcast: vi.fn(),
  sendLogToSubscribers: vi.fn(),
}));

vi.mock("../github/index.js", () => ({
  createIssueCommentForRepo: vi.fn(() =>
    Promise.resolve({ id: 123, url: "https://github.com/test/comment" }),
  ),
  getRepoConfigById: vi.fn(() =>
    Promise.resolve({ owner: "test-owner", name: "test-repo" }),
  ),
}));

vi.mock("../process-manager.js", () => ({
  registerProcess: vi.fn(() => Promise.resolve()),
  unregisterProcess: vi.fn(() => Promise.resolve()),
}));

vi.mock("../settings-helper.js", () => ({
  getClaudeSettings: vi.fn(() =>
    Promise.resolve({
      enabled: true,
      max_parallel_jobs: 1,
      max_runtime_ms: 600000,
    }),
  ),
  getWorkspaceSettings: vi.fn(() =>
    Promise.resolve({ owner: "test", name: "repo" }),
  ),
  isCodexEnabled: vi.fn(() => process.env.ENABLE_OPENAI_CODEX === "true"),
  hasOpenAIApiKey: vi.fn(() => !!process.env.OPENAI_API_KEY),
  getCodexSettings: vi.fn(() =>
    Promise.resolve({ max_parallel_jobs: 1, max_runtime_ms: 600000 }),
  ),
}));

// Track environment
const originalEnv = process.env;

describe("Provider Parity", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  describe("Claude Code - Error Constants", () => {
    it("should export CLAUDE_ERRORS with expected messages", async () => {
      const { CLAUDE_ERRORS } = await import("../claude-code-agent.js");

      expect(CLAUDE_ERRORS).toBeDefined();
      expect(CLAUDE_ERRORS.CLI_NOT_FOUND).toContain("Claude CLI not found");
      expect(CLAUDE_ERRORS.DISABLED).toContain("disabled");
    });
  });

  describe("Claude Code - Availability Checking", () => {
    it("should return DISABLED error when settings.enabled is false", async () => {
      // Get the mock and update it for this test
      const settingsHelper = await import("../settings-helper.js");
      vi.mocked(settingsHelper.getClaudeSettings).mockResolvedValueOnce({
        enabled: false,
        max_parallel_jobs: 1,
        max_runtime_ms: 600000,
        test_command: "npm test",
      });

      const { getClaudeAvailabilityError, CLAUDE_ERRORS } = await import(
        "../claude-code-agent.js"
      );

      const error = await getClaudeAvailabilityError();
      expect(error).toBe(CLAUDE_ERRORS.DISABLED);
    });
  });

  describe("Claude Code - Runner Status", () => {
    it("should return expected status structure", async () => {
      const { getClaudeRunnerStatus } = await import("./claude-code-runner.js");

      const status = await getClaudeRunnerStatus();

      expect(status).toMatchObject({
        type: "claude-code",
        available: expect.any(Boolean),
        configured: expect.any(Boolean),
        registered: true,
        message: expect.any(String),
        stub: false,
      });

      // Claude-specific fields
      expect(status).toHaveProperty("cliInstalled");
      expect(status).toHaveProperty("settingsEnabled");
    });
  });

  describe("OpenAI Codex - Error Constants", () => {
    it("should export CODEX_ERRORS with expected messages", async () => {
      process.env.ENABLE_OPENAI_CODEX = "true";
      process.env.OPENAI_API_KEY = "sk-test";

      const { CODEX_ERRORS } = await import("../openai-codex-agent.js");

      expect(CODEX_ERRORS).toBeDefined();
      expect(CODEX_ERRORS.NOT_ENABLED).toContain("not enabled");
      expect(CODEX_ERRORS.NO_API_KEY).toContain("OPENAI_API_KEY");
    });
  });

  describe("OpenAI Codex - Pause Function", () => {
    it("should export pauseCodexRun function", async () => {
      process.env.ENABLE_OPENAI_CODEX = "true";
      process.env.OPENAI_API_KEY = "sk-test";

      const { pauseCodexRun } = await import("../openai-codex-agent.js");

      expect(pauseCodexRun).toBeDefined();
      expect(typeof pauseCodexRun).toBe("function");
    });

    it("should return false for non-existent jobs", async () => {
      process.env.ENABLE_OPENAI_CODEX = "true";
      process.env.OPENAI_API_KEY = "sk-test";

      const { pauseCodexRun } = await import("../openai-codex-agent.js");

      const result = await pauseCodexRun("nonexistent-job");
      expect(result).toBe(false);
    });
  });

  describe("OpenAI Codex - Runner Status", () => {
    it("should return expected status structure when disabled", async () => {
      process.env.ENABLE_OPENAI_CODEX = undefined;
      process.env.OPENAI_API_KEY = undefined;

      vi.resetModules();

      const { getCodexRunnerStatus } = await import("./openai-codex-runner.js");

      const status = getCodexRunnerStatus();

      expect(status).toMatchObject({
        type: "openai-codex",
        available: false,
        configured: false,
        registered: false,
        message: expect.any(String),
        stub: false,
      });

      // Codex-specific fields
      expect(status).toHaveProperty("featureFlagEnabled");
      expect(status).toHaveProperty("apiKeySet");
    });

    it("should return available when fully configured", async () => {
      process.env.ENABLE_OPENAI_CODEX = "true";
      process.env.OPENAI_API_KEY = "sk-test-key";

      vi.resetModules();

      const { getCodexRunnerStatus } = await import("./openai-codex-runner.js");

      const status = getCodexRunnerStatus();

      expect(status.available).toBe(true);
      expect(status.configured).toBe(true);
      expect(status.featureFlagEnabled).toBe(true);
      expect(status.apiKeySet).toBe(true);
    });
  });

  describe("Parity - Both providers have equivalent functions", () => {
    it("should have matching error constant patterns", async () => {
      process.env.ENABLE_OPENAI_CODEX = "true";
      process.env.OPENAI_API_KEY = "sk-test";

      const { CLAUDE_ERRORS } = await import("../claude-code-agent.js");
      const { CODEX_ERRORS } = await import("../openai-codex-agent.js");

      // Both should have constants defined as objects with string values
      expect(typeof CLAUDE_ERRORS).toBe("object");
      expect(typeof CODEX_ERRORS).toBe("object");

      // Both should have at least one error constant
      expect(Object.keys(CLAUDE_ERRORS).length).toBeGreaterThan(0);
      expect(Object.keys(CODEX_ERRORS).length).toBeGreaterThan(0);
    });

    it("should have matching availability function patterns", async () => {
      process.env.ENABLE_OPENAI_CODEX = "true";
      process.env.OPENAI_API_KEY = "sk-test";

      const { getClaudeAvailabilityError } = await import(
        "../claude-code-agent.js"
      );
      const { getCodexAvailabilityError } = await import(
        "../openai-codex-agent.js"
      );

      // Both should be functions
      expect(typeof getClaudeAvailabilityError).toBe("function");
      expect(typeof getCodexAvailabilityError).toBe("function");

      // Both should return null or string
      const claudeResult = await getClaudeAvailabilityError();
      const codexResult = getCodexAvailabilityError();

      expect(claudeResult === null || typeof claudeResult === "string").toBe(
        true,
      );
      expect(codexResult === null || typeof codexResult === "string").toBe(
        true,
      );
    });

    it("should have matching pause function patterns", async () => {
      process.env.ENABLE_OPENAI_CODEX = "true";
      process.env.OPENAI_API_KEY = "sk-test";

      const { pauseClaudeRun } = await import("../claude-code-agent.js");
      const { pauseCodexRun } = await import("../openai-codex-agent.js");

      // Both should be functions
      expect(typeof pauseClaudeRun).toBe("function");
      expect(typeof pauseCodexRun).toBe("function");

      // Both should return false for non-existent jobs
      const claudeResult = await pauseClaudeRun("nonexistent");
      const codexResult = await pauseCodexRun("nonexistent");

      expect(claudeResult).toBe(false);
      expect(codexResult).toBe(false);
    });
  });
});
