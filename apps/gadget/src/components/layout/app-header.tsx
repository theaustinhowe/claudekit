"use client";

import { ClaudeUsageDialog, HeaderUsageWidget } from "@devkit/claude-usage/components/usage-shared";
import { ThemeToggle } from "@devkit/ui/components/theme-toggle";
import { useCallback, useEffect, useState, useTransition } from "react";
import { SessionIndicator } from "@/components/sessions/session-indicator";
import { getClaudeRateLimitsAction, getClaudeUsageStatsAction } from "@/lib/actions/claude-usage";
import type { ClaudeRateLimits, ClaudeUsageStats } from "@/lib/types";
import { MobileMenuButton, MobileSidebar } from "./app-sidebar";

export function AppHeader() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [claudeUsage, setClaudeUsage] = useState<ClaudeUsageStats | null>(null);
  const [rateLimits, setRateLimits] = useState<ClaudeRateLimits | null>(null);
  const [usageDialogOpen, setUsageDialogOpen] = useState(false);
  const [, startTransition] = useTransition();

  const refreshUsage = useCallback(() => {
    startTransition(async () => {
      const [stats, limits] = await Promise.all([getClaudeUsageStatsAction(), getClaudeRateLimitsAction()]);
      setClaudeUsage(stats);
      setRateLimits(limits);
    });
  }, []);

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

  return (
    <>
      <header className="h-14 border-b border-border bg-background/80 backdrop-blur-xs sticky top-0 z-30 flex items-center justify-between px-4 sm:px-6 gap-3">
        {/* Mobile: menu button */}
        <div className="flex items-center gap-2 md:hidden">
          <MobileMenuButton onClick={() => setMobileMenuOpen(true)} />
        </div>

        {/* Claude usage widget (desktop) */}
        <div className="flex-1 hidden sm:block">
          {claudeUsage && (
            <HeaderUsageWidget usage={claudeUsage} rateLimits={rateLimits} onClick={() => setUsageDialogOpen(true)} />
          )}
        </div>

        {/* Spacer for mobile */}
        <div className="flex-1 sm:hidden" />

        {/* Right actions */}
        <div className="flex items-center gap-1 sm:gap-2">
          <SessionIndicator />
          <ThemeToggle />
        </div>
      </header>
      <MobileSidebar open={mobileMenuOpen} onOpenChange={setMobileMenuOpen} />
      {claudeUsage && (
        <ClaudeUsageDialog
          open={usageDialogOpen}
          onOpenChange={setUsageDialogOpen}
          usage={claudeUsage}
          rateLimits={rateLimits}
        />
      )}
    </>
  );
}
