import { describe, expect, it, vi } from "vitest";

vi.mock("@claudekit/claude-usage/server", () => ({
  getClaudeUsageStats: vi.fn().mockResolvedValue({ totalTokens: 1000 }),
  getClaudeRateLimits: vi.fn().mockResolvedValue({ remaining: 500 }),
}));

import { getClaudeRateLimitsAction, getClaudeUsageStatsAction } from "./claude-usage";

describe("getClaudeUsageStatsAction", () => {
  it("returns usage stats", async () => {
    const result = await getClaudeUsageStatsAction();
    expect(result).toEqual({ totalTokens: 1000 });
  });
});

describe("getClaudeRateLimitsAction", () => {
  it("returns rate limits", async () => {
    const result = await getClaudeRateLimitsAction();
    expect(result).toEqual({ remaining: 500 });
  });
});
