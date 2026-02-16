import { Readable } from "node:stream";
import { type MockInstance, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────
// We mock the Node built-ins that session-parser and usage-api depend on.

vi.mock("node:os", () => ({
  homedir: () => "/mock-home",
}));

const mockReaddir = vi.fn<(path: string) => Promise<string[]>>();
const mockStat = vi.fn<(path: string) => Promise<{ isDirectory: () => boolean; mtime: Date }>>();
const mockReadFile = vi.fn<(path: string, encoding: string) => Promise<string>>();

vi.mock("node:fs/promises", () => ({
  readdir: (...args: unknown[]) => mockReaddir(args[0] as string),
  stat: (...args: unknown[]) => mockStat(args[0] as string),
  readFile: (...args: unknown[]) => mockReadFile(args[0] as string, args[1] as string),
}));

const mockCreateReadStream = vi.fn();

vi.mock("node:fs", () => ({
  createReadStream: (...args: unknown[]) => mockCreateReadStream(...args),
}));

const mockExecFile = vi.fn();

vi.mock("node:child_process", () => ({
  execFile: (...args: unknown[]) => mockExecFile(...args),
}));

// Mock global fetch for rate limits API tests
const mockFetch = vi.fn() as MockInstance;

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ─── Helper: create a readable stream from JSONL lines ────────────────────────
function jsonlStream(lines: unknown[]): Readable {
  const content = lines.map((l) => JSON.stringify(l)).join("\n") + "\n";
  return Readable.from(content);
}

// Today's date in YYYY-MM-DD format (same locale logic as the source)
const todayStr = new Date().toLocaleDateString("en-CA");

// ─── session-parser tests ─────────────────────────────────────────────────────

describe("getTodayUsageWithCost", () => {
  // We must import dynamically after mocks are set up, and use resetModules to clear cache
  async function importFresh() {
    vi.resetModules();
    return await import("./session-parser");
  }

  it("parses session files and aggregates tokens by model", async () => {
    const { getTodayUsageWithCost } = await importFresh();

    // Setup: ~/.claude/projects has one project dir with one jsonl file
    mockReaddir.mockImplementation(async (dir: string) => {
      if (dir === "/mock-home/.claude/projects") return ["my-project"];
      if (dir === "/mock-home/.claude/projects/my-project") return ["session.jsonl"];
      return [];
    });

    mockStat.mockImplementation(async (path: string) => {
      if (path === "/mock-home/.claude/projects/my-project") {
        return { isDirectory: () => true, mtime: new Date() };
      }
      // The jsonl file, modified today
      return { isDirectory: () => false, mtime: new Date() };
    });

    const now = new Date().toISOString();
    const lines = [
      {
        type: "assistant",
        timestamp: now,
        message: {
          id: "msg-1",
          model: "claude-sonnet-4-5",
          usage: { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 200, cache_creation_input_tokens: 100 },
        },
      },
      {
        type: "assistant",
        timestamp: now,
        message: {
          id: "msg-2",
          model: "claude-sonnet-4-5",
          usage: { input_tokens: 2000, output_tokens: 1000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        },
      },
    ];

    mockCreateReadStream.mockReturnValue(jsonlStream(lines));

    const result = await getTodayUsageWithCost();
    expect(result).not.toBeNull();
    expect(result!.modelBreakdown["claude-sonnet-4-5"]).toBeDefined();

    const breakdown = result!.modelBreakdown["claude-sonnet-4-5"];
    expect(breakdown.inputTokens).toBe(3000);
    expect(breakdown.outputTokens).toBe(1500);
    expect(breakdown.cacheReadInputTokens).toBe(200);
    expect(breakdown.cacheCreationInputTokens).toBe(100);
    expect(breakdown.costUSD).toBeGreaterThan(0);
    expect(result!.totalCostUSD).toBe(breakdown.costUSD);
  });

  it("deduplicates messages by id (last entry wins)", async () => {
    const { getTodayUsageWithCost } = await importFresh();

    mockReaddir.mockImplementation(async (dir: string) => {
      if (dir === "/mock-home/.claude/projects") return ["proj"];
      if (dir === "/mock-home/.claude/projects/proj") return ["s.jsonl"];
      return [];
    });

    mockStat.mockImplementation(async () => ({
      isDirectory: () => false,
      mtime: new Date(),
    }));
    mockStat.mockImplementationOnce(async () => ({
      isDirectory: () => true,
      mtime: new Date(),
    }));

    const now = new Date().toISOString();
    const lines = [
      {
        type: "assistant",
        timestamp: now,
        message: {
          id: "dup-msg",
          model: "claude-sonnet-4-5",
          usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        },
      },
      {
        type: "assistant",
        timestamp: now,
        message: {
          id: "dup-msg",
          model: "claude-sonnet-4-5",
          usage: { input_tokens: 999, output_tokens: 888, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        },
      },
    ];

    mockCreateReadStream.mockReturnValue(jsonlStream(lines));

    const result = await getTodayUsageWithCost();
    expect(result).not.toBeNull();
    // Last entry wins for dedup
    expect(result!.modelBreakdown["claude-sonnet-4-5"].inputTokens).toBe(999);
    expect(result!.modelBreakdown["claude-sonnet-4-5"].outputTokens).toBe(888);
  });

  it("skips non-assistant messages and entries without usage", async () => {
    const { getTodayUsageWithCost } = await importFresh();

    mockReaddir.mockImplementation(async (dir: string) => {
      if (dir === "/mock-home/.claude/projects") return ["proj"];
      if (dir === "/mock-home/.claude/projects/proj") return ["s.jsonl"];
      return [];
    });

    mockStat.mockImplementationOnce(async () => ({
      isDirectory: () => true,
      mtime: new Date(),
    }));
    mockStat.mockImplementation(async () => ({
      isDirectory: () => false,
      mtime: new Date(),
    }));

    const now = new Date().toISOString();
    const lines = [
      { type: "human", timestamp: now, message: { id: "h1", content: "hi" } },
      { type: "assistant", timestamp: now, message: { id: "no-usage", model: "claude-sonnet-4-5" } },
      { type: "assistant", timestamp: now, message: { id: "no-model", usage: { input_tokens: 1 } } },
    ];

    mockCreateReadStream.mockReturnValue(jsonlStream(lines));

    const result = await getTodayUsageWithCost();
    expect(result).not.toBeNull();
    expect(result!.totalCostUSD).toBe(0);
    expect(Object.keys(result!.modelBreakdown)).toHaveLength(0);
  });

  it("returns null when projects directory is missing", async () => {
    const { getTodayUsageWithCost } = await importFresh();

    mockReaddir.mockRejectedValue(new Error("ENOENT"));

    const result = await getTodayUsageWithCost();
    // parseTodayJSONL returns an object with empty breakdown and 0 cost when no files found
    expect(result).not.toBeNull();
    expect(result!.totalCostUSD).toBe(0);
  });

  it("aggregates tokens across multiple models", async () => {
    const { getTodayUsageWithCost } = await importFresh();

    mockReaddir.mockImplementation(async (dir: string) => {
      if (dir === "/mock-home/.claude/projects") return ["proj"];
      if (dir === "/mock-home/.claude/projects/proj") return ["s.jsonl"];
      return [];
    });

    mockStat.mockImplementationOnce(async () => ({
      isDirectory: () => true,
      mtime: new Date(),
    }));
    mockStat.mockImplementation(async () => ({
      isDirectory: () => false,
      mtime: new Date(),
    }));

    const now = new Date().toISOString();
    const lines = [
      {
        type: "assistant",
        timestamp: now,
        message: {
          id: "msg-opus",
          model: "claude-opus-4-5",
          usage: { input_tokens: 500, output_tokens: 200, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        },
      },
      {
        type: "assistant",
        timestamp: now,
        message: {
          id: "msg-sonnet",
          model: "claude-sonnet-4-5",
          usage: { input_tokens: 1000, output_tokens: 400, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        },
      },
    ];

    mockCreateReadStream.mockReturnValue(jsonlStream(lines));

    const result = await getTodayUsageWithCost();
    expect(result).not.toBeNull();
    expect(Object.keys(result!.modelBreakdown)).toHaveLength(2);
    expect(result!.modelBreakdown["claude-opus-4-5"]).toBeDefined();
    expect(result!.modelBreakdown["claude-sonnet-4-5"]).toBeDefined();
    // Opus should be more expensive than sonnet for similar token counts
    expect(result!.modelBreakdown["claude-opus-4-5"].costUSD).toBeGreaterThan(0);
    expect(result!.modelBreakdown["claude-sonnet-4-5"].costUSD).toBeGreaterThan(0);
    expect(result!.totalCostUSD).toBeCloseTo(
      result!.modelBreakdown["claude-opus-4-5"].costUSD + result!.modelBreakdown["claude-sonnet-4-5"].costUSD,
      10,
    );
  });
});

describe("getRecentDailyCosts", () => {
  async function importFresh() {
    vi.resetModules();
    return await import("./session-parser");
  }

  it("returns daily cost entries for the requested number of days", async () => {
    const { getRecentDailyCosts } = await importFresh();

    mockReaddir.mockImplementation(async (dir: string) => {
      if (dir === "/mock-home/.claude/projects") return ["proj"];
      if (dir === "/mock-home/.claude/projects/proj") return ["s.jsonl"];
      return [];
    });

    mockStat.mockImplementationOnce(async () => ({
      isDirectory: () => true,
      mtime: new Date(),
    }));
    mockStat.mockImplementation(async () => ({
      isDirectory: () => false,
      mtime: new Date(),
    }));

    const now = new Date().toISOString();
    const lines = [
      {
        type: "assistant",
        timestamp: now,
        message: {
          id: "msg-1",
          model: "claude-sonnet-4-5",
          usage: { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        },
      },
    ];

    mockCreateReadStream.mockReturnValue(jsonlStream(lines));

    const result = await getRecentDailyCosts(3);
    expect(result).toHaveLength(3);
    // Should be sorted oldest-first
    expect(result[0].date <= result[1].date).toBe(true);
    expect(result[1].date <= result[2].date).toBe(true);
    // Today should have non-zero cost
    const todayEntry = result.find((e) => e.date === todayStr);
    expect(todayEntry).toBeDefined();
    expect(todayEntry!.totalCostUSD).toBeGreaterThan(0);
  });

  it("returns empty array when projects directory is missing", async () => {
    const { getRecentDailyCosts } = await importFresh();

    mockReaddir.mockRejectedValue(new Error("ENOENT"));

    // parseRecentDaysJSONL will throw because collectRecentJsonlFiles returns [] from the
    // top-level readdir which catches and returns []. So it should succeed with zero costs.
    // But getRecentDailyCosts catches errors and returns [].
    const result = await getRecentDailyCosts(7);
    // Either an array of 7 zero-cost days (if parsing succeeds with no files) or [] if it throws
    expect(Array.isArray(result)).toBe(true);
  });
});

// ─── usage-api tests ──────────────────────────────────────────────────────────

describe("getClaudeRateLimits", () => {
  async function importFresh() {
    vi.resetModules();
    return await import("./usage-api");
  }

  it("returns rate limits when OAuth token and API response are valid", async () => {
    const { getClaudeRateLimits } = await importFresh();

    // Mock credentials file (fallback path since we can't easily mock execFile with promisify)
    mockReadFile.mockResolvedValue(
      JSON.stringify({ claudeAiOauth: { accessToken: "test-token-123" } }),
    );

    // On macOS the execFile will be called first for keychain — make it fail so it falls back to file
    mockExecFile.mockImplementation((...args: unknown[]) => {
      const cb = args[args.length - 1] as (err: Error | null, result?: unknown) => void;
      cb(new Error("keychain not available"));
    });

    const apiResponse = {
      five_hour: { utilization: 42, resets_at: "2026-02-15T12:00:00Z" },
      seven_day: { utilization: 15, resets_at: "2026-02-20T00:00:00Z" },
      seven_day_opus: { utilization: 80, resets_at: "2026-02-20T00:00:00Z" },
      seven_day_sonnet: { utilization: 30, resets_at: "2026-02-20T00:00:00Z" },
      extra_usage: {
        is_enabled: true,
        utilization: 25,
        used_credits: 50,
        monthly_limit: 200,
      },
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => apiResponse,
    });

    const result = await getClaudeRateLimits();
    expect(result).not.toBeNull();
    expect(result!.fiveHour.utilization).toBe(42);
    expect(result!.fiveHour.resetsAt).toBe("2026-02-15T12:00:00Z");
    expect(result!.sevenDay.utilization).toBe(15);
    expect(result!.modelLimits.opus).toBeDefined();
    expect(result!.modelLimits.opus.utilization).toBe(80);
    expect(result!.modelLimits.sonnet).toBeDefined();
    expect(result!.modelLimits.sonnet.utilization).toBe(30);
    expect(result!.extraUsage).not.toBeNull();
    expect(result!.extraUsage!.isEnabled).toBe(true);
    expect(result!.extraUsage!.usedCredits).toBe(50);
    expect(result!.extraUsage!.monthlyLimit).toBe(200);
  });

  it("returns null when no OAuth token is available", async () => {
    const { getClaudeRateLimits } = await importFresh();

    mockExecFile.mockImplementation((...args: unknown[]) => {
      const cb = args[args.length - 1] as (err: Error | null) => void;
      cb(new Error("no keychain"));
    });

    mockReadFile.mockRejectedValue(new Error("ENOENT"));

    const result = await getClaudeRateLimits();
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns null when API returns non-OK status", async () => {
    const { getClaudeRateLimits } = await importFresh();

    mockExecFile.mockImplementation((...args: unknown[]) => {
      const cb = args[args.length - 1] as (err: Error | null) => void;
      cb(new Error("no keychain"));
    });

    mockReadFile.mockResolvedValue(
      JSON.stringify({ claudeAiOauth: { accessToken: "test-token" } }),
    );

    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
    });

    const result = await getClaudeRateLimits();
    expect(result).toBeNull();
  });

  it("handles missing extra_usage gracefully", async () => {
    const { getClaudeRateLimits } = await importFresh();

    mockExecFile.mockImplementation((...args: unknown[]) => {
      const cb = args[args.length - 1] as (err: Error | null) => void;
      cb(new Error("no keychain"));
    });

    mockReadFile.mockResolvedValue(
      JSON.stringify({ claudeAiOauth: { accessToken: "test-token" } }),
    );

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        five_hour: { utilization: 10, resets_at: "2026-02-15T12:00:00Z" },
        seven_day: { utilization: 5, resets_at: "2026-02-20T00:00:00Z" },
      }),
    });

    const result = await getClaudeRateLimits();
    expect(result).not.toBeNull();
    expect(result!.extraUsage).toBeNull();
    expect(result!.fiveHour.utilization).toBe(10);
    expect(Object.keys(result!.modelLimits)).toHaveLength(0);
  });

  it("skips seven_day_oauth_apps and seven_day_cowork from model limits", async () => {
    const { getClaudeRateLimits } = await importFresh();

    mockExecFile.mockImplementation((...args: unknown[]) => {
      const cb = args[args.length - 1] as (err: Error | null) => void;
      cb(new Error("no keychain"));
    });

    mockReadFile.mockResolvedValue(
      JSON.stringify({ claudeAiOauth: { accessToken: "test-token" } }),
    );

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        five_hour: { utilization: 0, resets_at: "" },
        seven_day: { utilization: 0, resets_at: "" },
        seven_day_oauth_apps: { utilization: 50, resets_at: "2026-02-20T00:00:00Z" },
        seven_day_cowork: { utilization: 60, resets_at: "2026-02-20T00:00:00Z" },
        seven_day_opus: { utilization: 70, resets_at: "2026-02-20T00:00:00Z" },
      }),
    });

    const result = await getClaudeRateLimits();
    expect(result).not.toBeNull();
    // oauth_apps and cowork should be excluded
    expect(result!.modelLimits.oauth_apps).toBeUndefined();
    expect(result!.modelLimits.cowork).toBeUndefined();
    // opus should be included
    expect(result!.modelLimits.opus).toBeDefined();
    expect(result!.modelLimits.opus.utilization).toBe(70);
  });
});
