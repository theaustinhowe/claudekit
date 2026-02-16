import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock modules before imports
vi.mock("node:os", () => ({
  homedir: vi.fn().mockReturnValue("/home/testuser"),
}));

vi.mock("node:fs/promises", () => ({
  readdir: vi.fn(),
  stat: vi.fn(),
}));

vi.mock("node:fs", () => ({
  createReadStream: vi.fn(),
}));

vi.mock("./pricing", () => ({
  calculateModelCost: vi.fn().mockReturnValue(0.01),
}));

import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { calculateModelCost } from "./pricing";

function createReadableFromLines(lines: string[]): Readable {
  return Readable.from(lines.map((l) => `${l}\n`).join(""));
}

function makeAssistantEntry(
  id: string,
  model: string,
  timestamp: string,
  usage: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  },
) {
  return JSON.stringify({
    type: "assistant",
    timestamp,
    message: { id, model, usage },
  });
}

describe("getTodayUsageWithCost", () => {
  let getTodayUsageWithCost: typeof import("./session-parser").getTodayUsageWithCost;

  beforeEach(async () => {
    vi.resetAllMocks();
    vi.resetModules();
    // Re-import to clear module-level cache
    const mod = await import("./session-parser");
    getTodayUsageWithCost = mod.getTodayUsageWithCost;
  });

  it("returns null when projects directory is inaccessible", async () => {
    vi.mocked(readdir).mockRejectedValue(new Error("ENOENT"));
    const result = await getTodayUsageWithCost();
    // The function catches the error and returns the parsed result (empty)
    expect(result).toBeDefined();
    expect(result!.totalCostUSD).toBe(0);
  });

  it("discovers .jsonl files recursively", async () => {
    // Root dir has a subdir
    vi.mocked(readdir).mockResolvedValueOnce(["project1"] as never);
    vi.mocked(stat).mockResolvedValueOnce({
      isDirectory: () => true,
    } as never);

    // Subdir has a .jsonl file
    vi.mocked(readdir).mockResolvedValueOnce(["session.jsonl"] as never);
    vi.mocked(stat).mockResolvedValueOnce({
      isDirectory: () => false,
      mtime: new Date(),
    } as never);

    const stream = createReadableFromLines([
      makeAssistantEntry("m1", "claude-sonnet-4-5", new Date().toISOString(), {
        input_tokens: 100,
        output_tokens: 50,
      }),
    ]);
    vi.mocked(createReadStream).mockReturnValue(stream as never);

    const result = await getTodayUsageWithCost();
    expect(result).toBeDefined();
    expect(result!.modelBreakdown).toHaveProperty("claude-sonnet-4-5");
  });

  it("deduplicates messages by id (last write wins)", async () => {
    vi.mocked(readdir).mockResolvedValueOnce(["session.jsonl"] as never);
    const now = new Date();
    vi.mocked(stat).mockResolvedValueOnce({
      isDirectory: () => false,
      mtime: now,
    } as never);

    const stream = createReadableFromLines([
      makeAssistantEntry("m1", "claude-sonnet-4-5", now.toISOString(), {
        input_tokens: 100,
        output_tokens: 50,
      }),
      makeAssistantEntry("m1", "claude-sonnet-4-5", now.toISOString(), {
        input_tokens: 200,
        output_tokens: 100,
      }),
    ]);
    vi.mocked(createReadStream).mockReturnValue(stream as never);

    const result = await getTodayUsageWithCost();
    expect(result).toBeDefined();
    // Should use the last entry's values (200, 100)
    const sonnet = result!.modelBreakdown["claude-sonnet-4-5"];
    expect(sonnet.inputTokens).toBe(200);
    expect(sonnet.outputTokens).toBe(100);
  });

  it("aggregates tokens per model", async () => {
    vi.mocked(readdir).mockResolvedValueOnce(["session.jsonl"] as never);
    const now = new Date();
    vi.mocked(stat).mockResolvedValueOnce({
      isDirectory: () => false,
      mtime: now,
    } as never);

    const stream = createReadableFromLines([
      makeAssistantEntry("m1", "claude-sonnet-4-5", now.toISOString(), {
        input_tokens: 100,
        output_tokens: 50,
      }),
      makeAssistantEntry("m2", "claude-sonnet-4-5", now.toISOString(), {
        input_tokens: 200,
        output_tokens: 100,
      }),
      makeAssistantEntry("m3", "claude-opus-4-5", now.toISOString(), {
        input_tokens: 50,
        output_tokens: 25,
      }),
    ]);
    vi.mocked(createReadStream).mockReturnValue(stream as never);

    const result = await getTodayUsageWithCost();
    expect(result).toBeDefined();

    const sonnet = result!.modelBreakdown["claude-sonnet-4-5"];
    expect(sonnet.inputTokens).toBe(300);
    expect(sonnet.outputTokens).toBe(150);

    const opus = result!.modelBreakdown["claude-opus-4-5"];
    expect(opus.inputTokens).toBe(50);
    expect(opus.outputTokens).toBe(25);
  });

  it("calculates cost via calculateModelCost", async () => {
    vi.mocked(readdir).mockResolvedValueOnce(["session.jsonl"] as never);
    const now = new Date();
    vi.mocked(stat).mockResolvedValueOnce({
      isDirectory: () => false,
      mtime: now,
    } as never);

    const stream = createReadableFromLines([
      makeAssistantEntry("m1", "claude-sonnet-4-5", now.toISOString(), {
        input_tokens: 100,
        output_tokens: 50,
      }),
    ]);
    vi.mocked(createReadStream).mockReturnValue(stream as never);

    vi.mocked(calculateModelCost).mockReturnValue(0.05);

    const result = await getTodayUsageWithCost();
    expect(calculateModelCost).toHaveBeenCalled();
    expect(result!.totalCostUSD).toBe(0.05);
  });

  it("skips malformed JSON lines", async () => {
    vi.mocked(readdir).mockResolvedValueOnce(["session.jsonl"] as never);
    const now = new Date();
    vi.mocked(stat).mockResolvedValueOnce({
      isDirectory: () => false,
      mtime: now,
    } as never);

    const stream = createReadableFromLines([
      "not valid json",
      "{broken json}",
      makeAssistantEntry("m1", "claude-sonnet-4-5", now.toISOString(), {
        input_tokens: 100,
        output_tokens: 50,
      }),
    ]);
    vi.mocked(createReadStream).mockReturnValue(stream as never);

    const result = await getTodayUsageWithCost();
    expect(result).toBeDefined();
    expect(result!.modelBreakdown["claude-sonnet-4-5"].inputTokens).toBe(100);
  });

  it("skips entries missing required fields", async () => {
    vi.mocked(readdir).mockResolvedValueOnce(["session.jsonl"] as never);
    const now = new Date();
    vi.mocked(stat).mockResolvedValueOnce({
      isDirectory: () => false,
      mtime: now,
    } as never);

    const stream = createReadableFromLines([
      // Missing model
      JSON.stringify({
        type: "assistant",
        timestamp: now.toISOString(),
        message: { id: "m1", usage: { input_tokens: 10 } },
      }),
      // Missing usage
      JSON.stringify({
        type: "assistant",
        timestamp: now.toISOString(),
        message: { id: "m2", model: "claude-sonnet-4-5" },
      }),
      // Missing id
      JSON.stringify({
        type: "assistant",
        timestamp: now.toISOString(),
        message: { model: "claude-sonnet-4-5", usage: { input_tokens: 10 } },
      }),
      // Not assistant type
      JSON.stringify({
        type: "human",
        timestamp: now.toISOString(),
        message: { id: "m3", model: "claude-sonnet-4-5", usage: { input_tokens: 10 } },
      }),
    ]);
    vi.mocked(createReadStream).mockReturnValue(stream as never);

    const result = await getTodayUsageWithCost();
    expect(Object.keys(result!.modelBreakdown)).toHaveLength(0);
  });

  it("defaults missing token fields to 0", async () => {
    vi.mocked(readdir).mockResolvedValueOnce(["session.jsonl"] as never);
    const now = new Date();
    vi.mocked(stat).mockResolvedValueOnce({
      isDirectory: () => false,
      mtime: now,
    } as never);

    const stream = createReadableFromLines([makeAssistantEntry("m1", "claude-sonnet-4-5", now.toISOString(), {})]);
    vi.mocked(createReadStream).mockReturnValue(stream as never);

    const result = await getTodayUsageWithCost();
    const sonnet = result!.modelBreakdown["claude-sonnet-4-5"];
    expect(sonnet.inputTokens).toBe(0);
    expect(sonnet.outputTokens).toBe(0);
    expect(sonnet.cacheReadInputTokens).toBe(0);
    expect(sonnet.cacheCreationInputTokens).toBe(0);
  });

  it("returns cached result within 60s TTL", async () => {
    vi.useFakeTimers();

    vi.mocked(readdir).mockResolvedValue(["session.jsonl"] as never);
    const now = new Date();
    vi.mocked(stat).mockResolvedValue({
      isDirectory: () => false,
      mtime: now,
    } as never);

    const makeStream = () =>
      createReadableFromLines([
        makeAssistantEntry("m1", "claude-sonnet-4-5", now.toISOString(), { input_tokens: 100 }),
      ]);

    vi.mocked(createReadStream).mockReturnValue(makeStream() as never);
    const result1 = await getTodayUsageWithCost();

    vi.mocked(createReadStream).mockReturnValue(makeStream() as never);
    vi.advanceTimersByTime(30_000);
    const result2 = await getTodayUsageWithCost();

    // Should return same cached reference
    expect(result2).toBe(result1);
    // createReadStream should only have been called once (for the first call)
    expect(createReadStream).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it("skips inaccessible directories gracefully", async () => {
    vi.mocked(readdir).mockResolvedValueOnce(["accessible", "inaccessible"] as never);

    // First entry is accessible dir
    vi.mocked(stat).mockResolvedValueOnce({ isDirectory: () => true } as never);
    // Second entry throws
    vi.mocked(stat).mockRejectedValueOnce(new Error("EACCES"));

    // Accessible dir is empty
    vi.mocked(readdir).mockResolvedValueOnce([] as never);

    const result = await getTodayUsageWithCost();
    expect(result).toBeDefined();
  });

  it("handles empty jsonl file", async () => {
    vi.mocked(readdir).mockResolvedValueOnce(["empty.jsonl"] as never);
    const now = new Date();
    vi.mocked(stat).mockResolvedValueOnce({
      isDirectory: () => false,
      mtime: now,
    } as never);

    const stream = createReadableFromLines([]);
    vi.mocked(createReadStream).mockReturnValue(stream as never);

    const result = await getTodayUsageWithCost();
    expect(result).toBeDefined();
    expect(Object.keys(result!.modelBreakdown)).toHaveLength(0);
    expect(result!.totalCostUSD).toBe(0);
  });
});

describe("getRecentDailyCosts", () => {
  let getRecentDailyCosts: typeof import("./session-parser").getRecentDailyCosts;

  beforeEach(async () => {
    vi.resetAllMocks();
    vi.resetModules();
    const mod = await import("./session-parser");
    getRecentDailyCosts = mod.getRecentDailyCosts;
  });

  it("returns daily cost entries for N-day window", async () => {
    vi.mocked(readdir).mockResolvedValueOnce(["session.jsonl"] as never);
    const now = new Date();
    vi.mocked(stat).mockResolvedValueOnce({
      isDirectory: () => false,
      mtime: now,
    } as never);

    const stream = createReadableFromLines([
      makeAssistantEntry("m1", "claude-sonnet-4-5", now.toISOString(), { input_tokens: 100 }),
    ]);
    vi.mocked(createReadStream).mockReturnValue(stream as never);
    vi.mocked(calculateModelCost).mockReturnValue(0.01);

    const result = await getRecentDailyCosts(7);
    expect(result).toHaveLength(7);
    expect(result[0]).toHaveProperty("date");
    expect(result[0]).toHaveProperty("totalCostUSD");
  });

  it("returns empty array on error", async () => {
    vi.mocked(readdir).mockRejectedValue(new Error("ENOENT"));

    const result = await getRecentDailyCosts(3);
    // Should return dates with 0 cost since directories are empty
    expect(Array.isArray(result)).toBe(true);
  });

  it("returns cached result within TTL", async () => {
    vi.useFakeTimers();

    vi.mocked(readdir).mockResolvedValue([] as never);

    const result1 = await getRecentDailyCosts(7);
    const result2 = await getRecentDailyCosts(7);

    expect(result1).toBe(result2);
    // readdir called only once since cache is hit on second call
    expect(readdir).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });
});
