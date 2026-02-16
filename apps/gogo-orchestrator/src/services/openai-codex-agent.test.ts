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

vi.mock("./github.js", () => ({
  createIssueCommentForRepo: vi.fn(() =>
    Promise.resolve({ id: 123, url: "https://github.com/test/comment" }),
  ),
  getRepoConfigById: vi.fn(() =>
    Promise.resolve({ owner: "test-owner", name: "test-repo" }),
  ),
}));

vi.mock("./process-manager.js", () => ({
  registerProcess: vi.fn(() => Promise.resolve()),
  unregisterProcess: vi.fn(() => Promise.resolve()),
}));

// Track environment
const originalEnv = process.env;

describe("OpenAI Codex Agent", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    // Enable Codex by default in tests
    process.env.ENABLE_OPENAI_CODEX = "true";
    process.env.OPENAI_API_KEY = "sk-test-key";
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  describe("getCodexAvailabilityError", () => {
    it("should return null when fully configured", async () => {
      const { getCodexAvailabilityError } = await import(
        "./openai-codex-agent.js"
      );

      const error = getCodexAvailabilityError();
      expect(error).toBeNull();
    });

    it("should return error when feature flag disabled", async () => {
      process.env.ENABLE_OPENAI_CODEX = undefined;

      vi.resetModules();
      const { getCodexAvailabilityError, CODEX_ERRORS } = await import(
        "./openai-codex-agent.js"
      );

      const error = getCodexAvailabilityError();
      expect(error).toBe(CODEX_ERRORS.NOT_ENABLED);
    });

    it("should return error when API key not set", async () => {
      process.env.OPENAI_API_KEY = undefined;

      vi.resetModules();
      const { getCodexAvailabilityError, CODEX_ERRORS } = await import(
        "./openai-codex-agent.js"
      );

      const error = getCodexAvailabilityError();
      expect(error).toBe(CODEX_ERRORS.NO_API_KEY);
    });
  });

  describe("isRunning and getActiveRunCount", () => {
    it("should report no active runs initially", async () => {
      const { isRunning, getActiveRunCount } = await import(
        "./openai-codex-agent.js"
      );

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

  describe("injectCodexMessage", () => {
    it("should store pending injection when not running", async () => {
      // Mock queryOne to return a job
      const { queryOne, execute: executeMock } = await import(
        "../db/helpers.js"
      );
      vi.mocked(queryOne).mockResolvedValue({
        id: "test-job",
        status: "running",
        repository_id: "repo-1",
      });
      vi.mocked(executeMock).mockResolvedValue(undefined);

      const { injectCodexMessage } = await import("./openai-codex-agent.js");

      const result = await injectCodexMessage(
        "test-job",
        "Please also add tests",
        "queued",
      );
      expect(result.success).toBe(true);
    });
  });
});

describe("OpenAI Client Injection", () => {
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

  it("should allow setting custom client", async () => {
    const {
      setOpenAIClient,
      getOpenAIClient,
      resetOpenAIClient,
      MockOpenAIClient,
    } = await import("./openai/index.js");

    const mockClient = new MockOpenAIClient();
    mockClient.setResponses([{ content: "test response" }]);

    setOpenAIClient(mockClient);

    const client = getOpenAIClient();
    const result = await client.chat({
      model: "gpt-4o",
      messages: [{ role: "user", content: "hello" }],
    });

    expect(result.content).toBe("test response");

    // Cleanup
    resetOpenAIClient();
  });

  it("should create real client by default", async () => {
    const { getOpenAIClient, resetOpenAIClient } = await import(
      "./openai/index.js"
    );

    resetOpenAIClient();
    const client = getOpenAIClient();

    // Check it has the expected methods
    expect(typeof client.chat).toBe("function");
    expect(typeof client.chatStream).toBe("function");
  });
});
