"use client";

import type { ClaudeRateLimits, ClaudeUsageStats } from "@devkit/claude-usage";
import { ClaudeUsageDialog, HeaderUsageWidget } from "@devkit/claude-usage/components/usage-shared";
import { cn } from "@devkit/ui";
import { useCallback, useEffect, useState, useTransition } from "react";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { getClaudeRateLimitsAction, getClaudeUsageStatsAction } from "@/lib/actions/claude-usage";
import { useApp } from "@/lib/store";
import { PHASE_LABELS, type Phase } from "@/lib/types";

export function AppHeader() {
  const { state, dispatch } = useApp();
  const phases = [1, 2, 3, 4, 5, 6, 7] as Phase[];
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

  const handlePhaseClick = (phase: Phase) => {
    const status = state.phaseStatuses[phase];
    if (status === "locked") return;
    dispatch({ type: "GOTO_PHASE", phase });
  };

  return (
    <>
      <header className="flex items-center h-14 border-b border-border bg-background/80 backdrop-blur-sm px-4 shrink-0 sticky top-0 z-30">
        {/* Usage widget (desktop) */}
        {claudeUsage && (
          <div className="hidden sm:flex shrink-0 mr-3">
            <HeaderUsageWidget usage={claudeUsage} rateLimits={rateLimits} onClick={() => setUsageDialogOpen(true)} />
          </div>
        )}

        {/* Project name badge */}
        {state.projectName && (
          <div className="hidden md:flex items-center gap-1.5 mr-4 px-2.5 py-1 text-2xs bg-card border border-border rounded-lg text-muted-foreground">
            <span className="text-muted-foreground/60">project</span>
            <span className="text-primary">{state.projectName}</span>
          </div>
        )}

        {/* Phase stepper */}
        <nav className="flex items-center gap-0 ml-auto overflow-x-auto scrollbar-none">
          {phases.map((phase, i) => {
            const status = state.phaseStatuses[phase];
            const isCompleted = status === "completed";
            const isActive = status === "active";
            const isViewing = state.rightPanelContent === phase;
            return (
              <div key={phase} className="flex items-center shrink-0">
                {i > 0 && <div className={cn("w-3 md:w-5 h-px", status === "locked" ? "bg-border" : "bg-primary/40")} />}
                <button
                  type="button"
                  onClick={() => handlePhaseClick(phase)}
                  title={PHASE_LABELS[phase]}
                  className={cn(
                    "flex items-center gap-1.5 py-1.5 text-2xs transition-all px-1 md:px-2.5 rounded-lg border",
                    isCompleted && "cursor-pointer hover:opacity-80 text-primary border-transparent",
                    isActive && "text-primary-foreground bg-primary border-primary",
                    !isCompleted && !isActive && "cursor-default text-foreground/60 border-transparent",
                    isViewing && isCompleted && !isActive && "bg-primary/10 border-primary/30",
                    status === "locked" && "opacity-50",
                  )}
                >
                  <span
                    className={cn(
                      "w-5 h-5 flex items-center justify-center shrink-0 rounded-full text-[9px] font-semibold",
                      isCompleted && "bg-primary text-primary-foreground",
                      isActive && "bg-primary-foreground/20 text-primary-foreground",
                      !isCompleted && !isActive && "border-2 border-foreground/25 text-foreground/60",
                    )}
                  >
                    {isCompleted ? "\u2713" : phase}
                  </span>
                  <span className="hidden lg:inline">{PHASE_LABELS[phase]}</span>
                </button>
              </div>
            );
          })}
        </nav>

        {/* Theme toggle */}
        <div className="ml-3 shrink-0">
          <ThemeToggle />
        </div>
      </header>

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
