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

  it("auto-refreshes when rate limit reset time passes", async () => {
    vi.useFakeTimers();

    const getUsageStats = vi.fn().mockResolvedValue(mockUsage);
    // Rate limits that reset in 5 seconds
    const shortLimits = {
      fiveHour: { resetsAt: new Date(Date.now() + 5000).toISOString() },
      sevenDay: { resetsAt: new Date(Date.now() + 86400_000).toISOString() },
      modelLimits: {},
    };
    const getRateLimits = vi.fn().mockResolvedValue(shortLimits);

    renderHook(() => useClaudeUsageRefresh({ getUsageStats, getRateLimits }));

    // Wait for initial fetch
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    const initialCallCount = getUsageStats.mock.calls.length;

    // Advance past the soonest reset time (5s) + 2s buffer = 7s
    await act(async () => {
      await vi.advanceTimersByTimeAsync(7000);
    });

    // Should have been called again for the auto-refresh
    expect(getUsageStats.mock.calls.length).toBeGreaterThan(initialCallCount);

    vi.useRealTimers();
  });

  it("handles rate limits with modelLimits entries", async () => {
    vi.useFakeTimers();

    const getUsageStats = vi.fn().mockResolvedValue(mockUsage);
    const limitsWithModels = {
      fiveHour: { resetsAt: new Date(Date.now() + 86400_000).toISOString() },
      sevenDay: { resetsAt: new Date(Date.now() + 86400_000).toISOString() },
      modelLimits: {
        "claude-opus-4": { resetsAt: new Date(Date.now() + 3000).toISOString() },
        "claude-sonnet-4": { resetsAt: new Date(Date.now() + 10000).toISOString() },
      },
    };
    const getRateLimits = vi.fn().mockResolvedValue(limitsWithModels);

    renderHook(() => useClaudeUsageRefresh({ getUsageStats, getRateLimits }));

    // Wait for initial fetch
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    const initialCallCount = getUsageStats.mock.calls.length;

    // Advance past the soonest model reset (3s) + 2s buffer = 5s
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(getUsageStats.mock.calls.length).toBeGreaterThan(initialCallCount);

    vi.useRealTimers();
  });

  it("does not schedule auto-refresh when all resets are in the past", async () => {
    vi.useFakeTimers();

    const getUsageStats = vi.fn().mockResolvedValue(mockUsage);
    const pastLimits = {
      fiveHour: { resetsAt: new Date(Date.now() - 5000).toISOString() },
      sevenDay: { resetsAt: new Date(Date.now() - 5000).toISOString() },
      modelLimits: {},
    };
    const getRateLimits = vi.fn().mockResolvedValue(pastLimits);

    renderHook(() => useClaudeUsageRefresh({ getUsageStats, getRateLimits }));

    // Wait for initial fetch
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    const callCountAfterInit = getUsageStats.mock.calls.length;

    // Advance a lot of time - should not trigger refresh since all resets are in the past
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100_000);
    });

    expect(getUsageStats.mock.calls.length).toBe(callCountAfterInit);

    vi.useRealTimers();
  });
});
