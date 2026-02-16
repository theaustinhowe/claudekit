import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock environment before importing modules
const originalEnv = process.env;

beforeEach(() => {
  vi.resetModules();
  process.env = { ...originalEnv };
  // Ensure Codex is disabled by default
  process.env.ENABLE_OPENAI_CODEX = undefined;
  process.env.OPENAI_API_KEY = undefined;
});

afterEach(() => {
  process.env = originalEnv;
});

describe("Provider Selection", () => {
  describe("Default Provider", () => {
    it("should have claude-code as the default provider", async () => {
      const { agentRegistry } = await import("./index.js");

      // Claude Code should always be registered
      expect(agentRegistry.has("claude-code")).toBe(true);

      // Get all registered agents
      const agents = agentRegistry.getAll();
      const agentTypes = agents.map((a) => a.type);

      // Claude should be registered
      expect(agentTypes).toContain("claude-code");

      // Codex should NOT be registered by default
      expect(agentTypes).not.toContain("openai-codex");
    });

    it("should list claude-code first in available agents", async () => {
      const { agentRegistry } = await import("./index.js");

      const agents = agentRegistry.getAll();

      expect(agents.length).toBeGreaterThan(0);
      expect(agents[0].type).toBe("claude-code");
    });
  });

  describe("Codex Registration", () => {
    it("should not register codex without feature flag", async () => {
      // Ensure flag is not set
      process.env.ENABLE_OPENAI_CODEX = undefined;

      const { agentRegistry } = await import("./index.js");

      expect(agentRegistry.has("openai-codex")).toBe(false);
    });

    it("should register codex when feature flag is enabled", async () => {
      process.env.ENABLE_OPENAI_CODEX = "true";

      // Re-import to pick up new env
      vi.resetModules();
      const { agentRegistry } = await import("./index.js");

      expect(agentRegistry.has("openai-codex")).toBe(true);
    });
  });
});

describe("Codex Error Handling", () => {
  describe("getCodexAvailabilityError", () => {
    it("should return NOT_ENABLED error when feature flag is false", async () => {
      process.env.ENABLE_OPENAI_CODEX = undefined;

      const { getCodexAvailabilityError, CODEX_ERRORS } = await import("../openai-codex-agent.js");

      const error = await getCodexAvailabilityError();
      expect(error).toBe(CODEX_ERRORS.NOT_ENABLED);
    });

    it("should return NO_API_KEY error when flag enabled but no key", async () => {
      process.env.ENABLE_OPENAI_CODEX = "true";
      process.env.OPENAI_API_KEY = undefined;

      vi.resetModules();
      const { getCodexAvailabilityError, CODEX_ERRORS } = await import("../openai-codex-agent.js");

      const error = await getCodexAvailabilityError();
      expect(error).toBe(CODEX_ERRORS.NO_API_KEY);
    });

    it("should return null when fully configured and CLI available", async () => {
      process.env.ENABLE_OPENAI_CODEX = "true";
      process.env.OPENAI_API_KEY = "sk-test-key";

      vi.resetModules();
      const mod = await import("../openai-codex-agent.js");
      vi.spyOn(mod, "isCodexCliAvailable").mockResolvedValue(true);

      const error = await mod.getCodexAvailabilityError();
      expect(error).toBeNull();
    });
  });

  describe("openaiCodexRunner.start", () => {
    it("should return friendly error without crashing when not enabled", async () => {
      process.env.ENABLE_OPENAI_CODEX = undefined;

      const { openaiCodexRunner } = await import("./openai-codex-runner.js");
      const { CODEX_ERRORS } = await import("../openai-codex-agent.js");

      const mockContext = {
        jobId: "test-job-id",
        issueNumber: 1,
        issueTitle: "Test Issue",
        issueBody: null,
        worktreePath: "/tmp/test",
        branch: "test-branch",
        repositoryOwner: "test-owner",
        repositoryName: "test-repo",
      };

      const mockConfig = {};
      const mockCallbacks = {
        onLog: vi.fn(),
        onSignal: vi.fn(),
        onSessionCreated: vi.fn(),
        onPhaseChange: vi.fn(),
      };

      // Should not throw
      const result = await openaiCodexRunner.start(mockContext, mockConfig, mockCallbacks);

      // Should return structured error
      expect(result.success).toBe(false);
      expect(result.error).toBe(CODEX_ERRORS.NOT_ENABLED);
    });

    it("should return api key error when flag enabled but no key", async () => {
      process.env.ENABLE_OPENAI_CODEX = "true";
      process.env.OPENAI_API_KEY = undefined;

      vi.resetModules();
      const { openaiCodexRunner } = await import("./openai-codex-runner.js");
      const { CODEX_ERRORS } = await import("../openai-codex-agent.js");

      const mockContext = {
        jobId: "test-job-id",
        issueNumber: 1,
        issueTitle: "Test Issue",
        issueBody: null,
        worktreePath: "/tmp/test",
        branch: "test-branch",
        repositoryOwner: "test-owner",
        repositoryName: "test-repo",
      };

      const result = await openaiCodexRunner.start(
        mockContext,
        {},
        {
          onLog: vi.fn(),
          onSignal: vi.fn(),
          onSessionCreated: vi.fn(),
          onPhaseChange: vi.fn(),
        },
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe(CODEX_ERRORS.NO_API_KEY);
    });
  });

  describe("openaiCodexRunner runtime behavior", () => {
    it("should report zero active runs initially", async () => {
      const { openaiCodexRunner } = await import("./openai-codex-runner.js");

      expect(openaiCodexRunner.getActiveRunCount()).toBe(0);
    });

    it("should report not running for any job initially", async () => {
      const { openaiCodexRunner } = await import("./openai-codex-runner.js");

      expect(openaiCodexRunner.isRunning("any-job-id")).toBe(false);
    });

    it("should have full capabilities (no longer a stub)", async () => {
      const { openaiCodexRunner } = await import("./openai-codex-runner.js");

      expect(openaiCodexRunner.capabilities.canResume).toBe(true);
      expect(openaiCodexRunner.capabilities.canInject).toBe(true);
      expect(openaiCodexRunner.capabilities.supportsStreaming).toBe(true);
    });

    it("should return false for stop when nothing running", async () => {
      const { openaiCodexRunner } = await import("./openai-codex-runner.js");

      const result = await openaiCodexRunner.stop("any-job-id");
      expect(result).toBe(false);
    });
  });
});

describe("Settings Helper", () => {
  describe("isCodexEnabled", () => {
    it("should return false by default", async () => {
      process.env.ENABLE_OPENAI_CODEX = undefined;

      vi.resetModules();
      const { isCodexEnabled } = await import("../settings-helper.js");

      expect(isCodexEnabled()).toBe(false);
    });

    it("should return true when ENABLE_OPENAI_CODEX=true", async () => {
      process.env.ENABLE_OPENAI_CODEX = "true";

      vi.resetModules();
      const { isCodexEnabled } = await import("../settings-helper.js");

      expect(isCodexEnabled()).toBe(true);
    });

    it("should return false for other values", async () => {
      process.env.ENABLE_OPENAI_CODEX = "false";

      vi.resetModules();
      const { isCodexEnabled } = await import("../settings-helper.js");

      expect(isCodexEnabled()).toBe(false);

      process.env.ENABLE_OPENAI_CODEX = "1";
      vi.resetModules();
      const { isCodexEnabled: isCodexEnabled2 } = await import("../settings-helper.js");
      expect(isCodexEnabled2()).toBe(false);
    });
  });

  describe("hasOpenAIApiKey", () => {
    it("should return false when no key set", async () => {
      process.env.OPENAI_API_KEY = undefined;

      vi.resetModules();
      const { hasOpenAIApiKey } = await import("../settings-helper.js");

      expect(hasOpenAIApiKey()).toBe(false);
    });

    it("should return true when key is set", async () => {
      process.env.OPENAI_API_KEY = "sk-test-key";

      vi.resetModules();
      const { hasOpenAIApiKey } = await import("../settings-helper.js");

      expect(hasOpenAIApiKey()).toBe(true);
    });

    it("should return false for empty string", async () => {
      process.env.OPENAI_API_KEY = "";

      vi.resetModules();
      const { hasOpenAIApiKey } = await import("../settings-helper.js");

      expect(hasOpenAIApiKey()).toBe(false);
    });
  });
});

describe("Codex Runner Status", () => {
  it("should indicate not a stub when fully configured", async () => {
    process.env.ENABLE_OPENAI_CODEX = "true";
    process.env.OPENAI_API_KEY = "sk-test-key";

    vi.resetModules();
    const { getCodexRunnerStatus } = await import("./openai-codex-runner.js");

    const status = await getCodexRunnerStatus();

    expect(status.stub).toBe(false);
    // Note: available depends on CLI being installed, which may vary in test env
    expect(status.featureFlagEnabled).toBe(true);
    expect(status.apiKeySet).toBe(true);
  });

  it("should show correct message when not enabled", async () => {
    process.env.ENABLE_OPENAI_CODEX = undefined;

    vi.resetModules();
    const { getCodexRunnerStatus } = await import("./openai-codex-runner.js");
    const { CODEX_ERRORS } = await import("../openai-codex-agent.js");

    const status = await getCodexRunnerStatus();

    expect(status.featureFlagEnabled).toBe(false);
    expect(status.message).toBe(CODEX_ERRORS.NOT_ENABLED);
    expect(status.available).toBe(false);
  });

  it("should show correct message when enabled but no api key", async () => {
    process.env.ENABLE_OPENAI_CODEX = "true";
    process.env.OPENAI_API_KEY = undefined;

    vi.resetModules();
    const { getCodexRunnerStatus } = await import("./openai-codex-runner.js");
    const { CODEX_ERRORS } = await import("../openai-codex-agent.js");

    const status = await getCodexRunnerStatus();

    expect(status.featureFlagEnabled).toBe(true);
    expect(status.apiKeySet).toBe(false);
    expect(status.message).toBe(CODEX_ERRORS.NO_API_KEY);
    expect(status.available).toBe(false);
  });

  it("should have cliInstalled field", async () => {
    process.env.ENABLE_OPENAI_CODEX = "true";
    process.env.OPENAI_API_KEY = "sk-test-key";

    vi.resetModules();
    const { getCodexRunnerStatus } = await import("./openai-codex-runner.js");

    const status = await getCodexRunnerStatus();

    expect(status).toHaveProperty("cliInstalled");
    expect(typeof status.cliInstalled).toBe("boolean");
  });
});
