import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@devkit/claude-usage/server", () => ({
  getClaudeUsageStats: vi.fn(),
  getClaudeRateLimits: vi.fn(),
}));

import { getClaudeRateLimits, getClaudeUsageStats } from "@devkit/claude-usage/server";
import { getClaudeRateLimitsAction, getClaudeUsageStatsAction } from "./claude-usage";

const mockGetUsageStats = vi.mocked(getClaudeUsageStats);
const mockGetRateLimits = vi.mocked(getClaudeRateLimits);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("getClaudeUsageStatsAction", () => {
  it("returns usage stats from underlying function", async () => {
    const stats = { totalTokens: 1000, totalCost: 0.5 };
    mockGetUsageStats.mockResolvedValue(stats as never);

    const result = await getClaudeUsageStatsAction();
    expect(result).toEqual(stats);
  });

  it("returns null when no stats", async () => {
    mockGetUsageStats.mockResolvedValue(null);

    const result = await getClaudeUsageStatsAction();
    expect(result).toBeNull();
  });
});

describe("getClaudeRateLimitsAction", () => {
  it("returns rate limits from underlying function", async () => {
    const limits = { remaining: 100, limit: 1000 };
    mockGetRateLimits.mockResolvedValue(limits as never);

    const result = await getClaudeRateLimitsAction();
    expect(result).toEqual(limits);
  });

  it("returns null when no limits", async () => {
    mockGetRateLimits.mockResolvedValue(null);

    const result = await getClaudeRateLimitsAction();
    expect(result).toBeNull();
  });
});
