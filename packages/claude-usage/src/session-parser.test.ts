import { Readable } from "node:stream";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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
import { homedir } from "node:os";
import { calculateModelCost } from "./pricing";
import { getRecentDailyCosts, getTodayUsageWithCost } from "./session-parser";

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
  beforeAll(() => {
    vi.useFakeTimers();
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.resetAllMocks();
    // Restore mocks cleared by resetAllMocks
    vi.mocked(homedir).mockReturnValue("/home/testuser");
    vi.mocked(calculateModelCost).mockReturnValue(0.01);
    // Advance past 60s cache TTL to invalidate any cached result
    vi.advanceTimersByTime(61_000);
  });

  it("returns result with zero cost when projects directory is inaccessible", async () => {
    vi.mocked(readdir).mockRejectedValue(new Error("ENOENT"));
    const result = await getTodayUsageWithCost();
    expect(result).toBeDefined();
    expect(result?.totalCostUSD).toBe(0);
  });

  it("discovers .jsonl files recursively", async () => {
    vi.mocked(readdir).mockResolvedValueOnce(["project1"] as never);
    vi.mocked(stat).mockResolvedValueOnce({ isDirectory: () => true } as never);

    vi.mocked(readdir).mockResolvedValueOnce(["session.jsonl"] as never);
    vi.mocked(stat).mockResolvedValueOnce({ isDirectory: () => false, mtime: new Date() } as never);

    vi.mocked(createReadStream).mockReturnValue(
      createReadableFromLines([
        makeAssistantEntry("m1", "claude-sonnet-4-5", new Date().toISOString(), {
          input_tokens: 100,
          output_tokens: 50,
        }),
      ]) as never,
    );

    const result = await getTodayUsageWithCost();
    expect(result).toBeDefined();
    expect(result?.modelBreakdown).toHaveProperty("claude-sonnet-4-5");
  });

  it("deduplicates messages by id (last write wins)", async () => {
    vi.mocked(readdir).mockResolvedValueOnce(["session.jsonl"] as never);
    const now = new Date();
    vi.mocked(stat).mockResolvedValueOnce({ isDirectory: () => false, mtime: now } as never);

    vi.mocked(createReadStream).mockReturnValue(
      createReadableFromLines([
        makeAssistantEntry("m1", "claude-sonnet-4-5", now.toISOString(), { input_tokens: 100, output_tokens: 50 }),
        makeAssistantEntry("m1", "claude-sonnet-4-5", now.toISOString(), { input_tokens: 200, output_tokens: 100 }),
      ]) as never,
    );

    const result = await getTodayUsageWithCost();
    if (!result) return expect(result).not.toBeNull();
    const sonnet = result.modelBreakdown["claude-sonnet-4-5"];
    expect(sonnet.inputTokens).toBe(200);
    expect(sonnet.outputTokens).toBe(100);
  });

  it("aggregates tokens per model", async () => {
    vi.mocked(readdir).mockResolvedValueOnce(["session.jsonl"] as never);
    const now = new Date();
    vi.mocked(stat).mockResolvedValueOnce({ isDirectory: () => false, mtime: now } as never);

    vi.mocked(createReadStream).mockReturnValue(
      createReadableFromLines([
        makeAssistantEntry("m1", "claude-sonnet-4-5", now.toISOString(), { input_tokens: 100, output_tokens: 50 }),
        makeAssistantEntry("m2", "claude-sonnet-4-5", now.toISOString(), { input_tokens: 200, output_tokens: 100 }),
        makeAssistantEntry("m3", "claude-opus-4-5", now.toISOString(), { input_tokens: 50, output_tokens: 25 }),
      ]) as never,
    );

    const result = await getTodayUsageWithCost();
    expect(result?.modelBreakdown["claude-sonnet-4-5"].inputTokens).toBe(300);
    expect(result?.modelBreakdown["claude-sonnet-4-5"].outputTokens).toBe(150);
    expect(result?.modelBreakdown["claude-opus-4-5"].inputTokens).toBe(50);
  });

  it("calculates cost via calculateModelCost", async () => {
    vi.mocked(readdir).mockResolvedValueOnce(["session.jsonl"] as never);
    const now = new Date();
    vi.mocked(stat).mockResolvedValueOnce({ isDirectory: () => false, mtime: now } as never);

    vi.mocked(createReadStream).mockReturnValue(
      createReadableFromLines([
        makeAssistantEntry("m1", "claude-sonnet-4-5", now.toISOString(), { input_tokens: 100, output_tokens: 50 }),
      ]) as never,
    );

    vi.mocked(calculateModelCost).mockReturnValue(0.05);

    const result = await getTodayUsageWithCost();
    expect(calculateModelCost).toHaveBeenCalled();
    expect(result?.totalCostUSD).toBe(0.05);
  });

  it("skips malformed JSON lines", async () => {
    vi.mocked(readdir).mockResolvedValueOnce(["session.jsonl"] as never);
    const now = new Date();
    vi.mocked(stat).mockResolvedValueOnce({ isDirectory: () => false, mtime: now } as never);

    vi.mocked(createReadStream).mockReturnValue(
      createReadableFromLines([
        "not valid json",
        "{broken json}",
        makeAssistantEntry("m1", "claude-sonnet-4-5", now.toISOString(), { input_tokens: 100, output_tokens: 50 }),
      ]) as never,
    );

    const result = await getTodayUsageWithCost();
    expect(result?.modelBreakdown["claude-sonnet-4-5"].inputTokens).toBe(100);
  });

  it("skips entries missing required fields", async () => {
    vi.mocked(readdir).mockResolvedValueOnce(["session.jsonl"] as never);
    const now = new Date();
    vi.mocked(stat).mockResolvedValueOnce({ isDirectory: () => false, mtime: now } as never);

    vi.mocked(createReadStream).mockReturnValue(
      createReadableFromLines([
        JSON.stringify({ type: "assistant", timestamp: now.toISOString(), message: { id: "m1", usage: {} } }),
        JSON.stringify({ type: "assistant", timestamp: now.toISOString(), message: { id: "m2", model: "sonnet" } }),
        JSON.stringify({ type: "assistant", timestamp: now.toISOString(), message: { model: "sonnet", usage: {} } }),
        JSON.stringify({
          type: "human",
          timestamp: now.toISOString(),
          message: { id: "m3", model: "sonnet", usage: {} },
        }),
      ]) as never,
    );

    const result = await getTodayUsageWithCost();
    if (!result) return expect(result).not.toBeNull();
    expect(Object.keys(result.modelBreakdown)).toHaveLength(0);
  });

  it("defaults missing token fields to 0", async () => {
    vi.mocked(readdir).mockResolvedValueOnce(["session.jsonl"] as never);
    const now = new Date();
    vi.mocked(stat).mockResolvedValueOnce({ isDirectory: () => false, mtime: now } as never);

    vi.mocked(createReadStream).mockReturnValue(
      createReadableFromLines([makeAssistantEntry("m1", "claude-sonnet-4-5", now.toISOString(), {})]) as never,
    );

    const result = await getTodayUsageWithCost();
    if (!result) return expect(result).not.toBeNull();
    const sonnet = result.modelBreakdown["claude-sonnet-4-5"];
    expect(sonnet.inputTokens).toBe(0);
    expect(sonnet.outputTokens).toBe(0);
    expect(sonnet.cacheReadInputTokens).toBe(0);
    expect(sonnet.cacheCreationInputTokens).toBe(0);
  });

  it("returns cached result within 60s TTL", async () => {
    vi.mocked(readdir).mockResolvedValue(["session.jsonl"] as never);
    const now = new Date();
    vi.mocked(stat).mockResolvedValue({ isDirectory: () => false, mtime: now } as never);

    vi.mocked(createReadStream).mockReturnValue(
      createReadableFromLines([
        makeAssistantEntry("m1", "claude-sonnet-4-5", now.toISOString(), { input_tokens: 100 }),
      ]) as never,
    );

    const result1 = await getTodayUsageWithCost();
    const callCount = vi.mocked(createReadStream).mock.calls.length;

    vi.advanceTimersByTime(30_000);
    const result2 = await getTodayUsageWithCost();

    expect(result2).toBe(result1);
    expect(vi.mocked(createReadStream).mock.calls.length).toBe(callCount);
  });

  it("skips inaccessible directories gracefully", async () => {
    vi.mocked(readdir).mockResolvedValueOnce(["accessible", "inaccessible"] as never);
    vi.mocked(stat).mockResolvedValueOnce({ isDirectory: () => true } as never);
    vi.mocked(stat).mockRejectedValueOnce(new Error("EACCES"));
    vi.mocked(readdir).mockResolvedValueOnce([] as never);

    const result = await getTodayUsageWithCost();
    expect(result).toBeDefined();
  });

  it("handles empty jsonl file", async () => {
    vi.mocked(readdir).mockResolvedValueOnce(["empty.jsonl"] as never);
    const now = new Date();
    vi.mocked(stat).mockResolvedValueOnce({ isDirectory: () => false, mtime: now } as never);

    vi.mocked(createReadStream).mockReturnValue(createReadableFromLines([]) as never);

    const result = await getTodayUsageWithCost();
    if (!result) return expect(result).not.toBeNull();
    expect(Object.keys(result.modelBreakdown)).toHaveLength(0);
    expect(result.totalCostUSD).toBe(0);
  });
});

describe("getRecentDailyCosts", () => {
  beforeAll(() => {
    vi.useFakeTimers();
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.resetAllMocks();
    // Restore mocks cleared by resetAllMocks
    vi.mocked(homedir).mockReturnValue("/home/testuser");
    vi.mocked(calculateModelCost).mockReturnValue(0.01);
    vi.advanceTimersByTime(61_000);
  });

  it("returns daily cost entries for N-day window", async () => {
    vi.mocked(readdir).mockResolvedValueOnce(["session.jsonl"] as never);
    const now = new Date();
    vi.mocked(stat).mockResolvedValueOnce({ isDirectory: () => false, mtime: now } as never);

    vi.mocked(createReadStream).mockReturnValue(
      createReadableFromLines([
        makeAssistantEntry("m1", "claude-sonnet-4-5", now.toISOString(), { input_tokens: 100 }),
      ]) as never,
    );

    const result = await getRecentDailyCosts(7);
    expect(result).toHaveLength(7);
    expect(result[0]).toHaveProperty("date");
    expect(result[0]).toHaveProperty("totalCostUSD");
  });

  it("returns empty array on error", async () => {
    vi.mocked(readdir).mockRejectedValue(new Error("ENOENT"));
    const result = await getRecentDailyCosts(3);
    expect(Array.isArray(result)).toBe(true);
  });

  it("returns cached result within TTL", async () => {
    vi.mocked(readdir).mockResolvedValue([] as never);
    const result1 = await getRecentDailyCosts(7);
    const callCount = vi.mocked(readdir).mock.calls.length;

    const result2 = await getRecentDailyCosts(7);
    expect(result1).toBe(result2);
    expect(vi.mocked(readdir).mock.calls.length).toBe(callCount);
  });
});
