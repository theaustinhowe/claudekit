import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useClaudeUsageRefresh } from "./use-claude-usage-refresh";

beforeEach(() => {
  vi.useRealTimers();
});

describe("useClaudeUsageRefresh", () => {
  const mockUsage = { totalCost: 5.0, totalTokens: 10000 };
  const mockLimits = {
    fiveHour: { resetsAt: new Date(Date.now() + 3600_000).toISOString() },
    sevenDay: { resetsAt: new Date(Date.now() + 86400_000).toISOString() },
    modelLimits: {},
  };

  it("fetches usage and rate limits on mount", async () => {
    const getUsageStats = vi.fn().mockResolvedValue(mockUsage);
    const getRateLimits = vi.fn().mockResolvedValue(mockLimits);

    const { result } = renderHook(() => useClaudeUsageRefresh({ getUsageStats, getRateLimits }));

    await waitFor(() => {
      expect(result.current.claudeUsage).toEqual(mockUsage);
    });

    expect(getUsageStats).toHaveBeenCalled();
    expect(getRateLimits).toHaveBeenCalled();
    expect(result.current.rateLimits).toEqual(mockLimits);
  });

  it("starts with null values", () => {
    const getUsageStats = vi.fn().mockResolvedValue(mockUsage);
    const getRateLimits = vi.fn().mockResolvedValue(mockLimits);

    const { result } = renderHook(() => useClaudeUsageRefresh({ getUsageStats, getRateLimits }));

    // Initially null before fetching completes
    expect(result.current.claudeUsage).toBeNull();
    expect(result.current.rateLimits).toBeNull();
  });

  it("exposes usageDialogOpen state", () => {
    const getUsageStats = vi.fn().mockResolvedValue(null);
    const getRateLimits = vi.fn().mockResolvedValue(null);

    const { result } = renderHook(() => useClaudeUsageRefresh({ getUsageStats, getRateLimits }));

    expect(result.current.usageDialogOpen).toBe(false);

    act(() => {
      result.current.setUsageDialogOpen(true);
    });

    expect(result.current.usageDialogOpen).toBe(true);
  });

  it("refreshUsage re-fetches both stats and limits", async () => {
    const getUsageStats = vi.fn().mockResolvedValue(mockUsage);
    const getRateLimits = vi.fn().mockResolvedValue(mockLimits);

    const { result } = renderHook(() => useClaudeUsageRefresh({ getUsageStats, getRateLimits }));

    await waitFor(() => {
      expect(result.current.claudeUsage).not.toBeNull();
    });

    const updatedUsage = { totalCost: 10.0, totalTokens: 20000 };
    getUsageStats.mockResolvedValue(updatedUsage);

    act(() => {
      result.current.refreshUsage();
    });

    await waitFor(() => {
      expect(result.current.claudeUsage).toEqual(updatedUsage);
    });
  });

  it("handles null responses gracefully", async () => {
    const getUsageStats = vi.fn().mockResolvedValue(null);
    const getRateLimits = vi.fn().mockResolvedValue(null);

    const { result } = renderHook(() => useClaudeUsageRefresh({ getUsageStats, getRateLimits }));

    await waitFor(() => {
      expect(getUsageStats).toHaveBeenCalled();
    });

    expect(result.current.claudeUsage).toBeNull();
    expect(result.current.rateLimits).toBeNull();
  });
});
