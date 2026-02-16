"use client";

import { useCallback, useEffect, useState, useTransition } from "react";

/** Minimal shape the hook needs to extract reset times from rate limits. */
interface RateLimitResetInfo {
  fiveHour: { resetsAt: string };
  sevenDay: { resetsAt: string };
  modelLimits: Record<string, { resetsAt: string }>;
}

export interface UseClaudeUsageRefreshOptions<TUsage, TLimits extends RateLimitResetInfo> {
  getUsageStats: () => Promise<TUsage | null>;
  getRateLimits: () => Promise<TLimits | null>;
}

export interface UseClaudeUsageRefreshReturn<TUsage, TLimits> {
  claudeUsage: TUsage | null;
  rateLimits: TLimits | null;
  usageDialogOpen: boolean;
  setUsageDialogOpen: (open: boolean) => void;
  refreshUsage: () => void;
}

/**
 * Fetches Claude usage stats and rate limits, auto-refreshing when the soonest
 * rate-limit window resets. Accepts server actions via dependency injection so
 * each Next.js app can pass its own `"use server"` functions.
 */
export function useClaudeUsageRefresh<TUsage, TLimits extends RateLimitResetInfo>({
  getUsageStats,
  getRateLimits,
}: UseClaudeUsageRefreshOptions<TUsage, TLimits>): UseClaudeUsageRefreshReturn<TUsage, TLimits> {
  const [claudeUsage, setClaudeUsage] = useState<TUsage | null>(null);
  const [rateLimits, setRateLimits] = useState<TLimits | null>(null);
  const [usageDialogOpen, setUsageDialogOpen] = useState(false);
  const [, startTransition] = useTransition();

  const refreshUsage = useCallback(() => {
    startTransition(async () => {
      const [stats, limits] = await Promise.all([getUsageStats(), getRateLimits()]);
      setClaudeUsage(stats);
      setRateLimits(limits);
    });
  }, [getUsageStats, getRateLimits]);

  // Initial fetch
  useEffect(() => {
    refreshUsage();
  }, [refreshUsage]);

  // Auto-refresh when the soonest rate-limit window resets
  useEffect(() => {
    if (!rateLimits) return;

    const resetTimes: number[] = [];
    if (rateLimits.fiveHour.resetsAt) resetTimes.push(new Date(rateLimits.fiveHour.resetsAt).getTime());
    if (rateLimits.sevenDay.resetsAt) resetTimes.push(new Date(rateLimits.sevenDay.resetsAt).getTime());
    for (const w of Object.values(rateLimits.modelLimits)) {
      if (w.resetsAt) resetTimes.push(new Date(w.resetsAt).getTime());
    }

    const now = Date.now();
    const futureResets = resetTimes.filter((t) => t > now);
    if (futureResets.length === 0) return;

    const delayMs = Math.min(...futureResets) - now + 2000; // 2s after reset
    const id = setTimeout(refreshUsage, delayMs);
    return () => clearTimeout(id);
  }, [rateLimits, refreshUsage]);

  return { claudeUsage, rateLimits, usageDialogOpen, setUsageDialogOpen, refreshUsage };
}
