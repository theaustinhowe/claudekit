import { cast } from "@claudekit/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@claudekit/claude-usage/server", () => ({
  getClaudeRateLimits: vi.fn(),
}));

import { getClaudeRateLimits } from "@claudekit/claude-usage/server";
import { GET } from "./route";

const mockGetClaudeRateLimits = vi.mocked(getClaudeRateLimits);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/claude-usage", () => {
  it("returns rate limits", async () => {
    mockGetClaudeRateLimits.mockResolvedValue(
      cast({
        daily: { used: 100, limit: 1000 },
      }),
    );

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.rateLimits).toBeDefined();
    expect(data.rateLimits.daily.used).toBe(100);
  });
});
