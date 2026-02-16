"use client";

import type { ClaudeRateLimits, ClaudeUsageStats } from "@devkit/claude-usage";
import { ClaudeUsageDialog, HeaderUsageWidget } from "@devkit/claude-usage/components/usage-shared";
import { useClaudeUsageRefresh } from "@devkit/hooks";
import type { ReactNode } from "react";
import { ThemeToggle } from "../theme-toggle";
import type { ClaudeUsageActions } from "./types";

// ---------------------------------------------------------------------------
// Internal: usage section (avoids conditional hook call in header)
// ---------------------------------------------------------------------------

function UsageSection({ claudeUsage: actions }: { claudeUsage: ClaudeUsageActions }) {
  const { claudeUsage, rateLimits, usageDialogOpen, setUsageDialogOpen } = useClaudeUsageRefresh({
    getUsageStats: actions.getUsageStats as () => Promise<ClaudeUsageStats | null>,
    getRateLimits: actions.getRateLimits as () => Promise<ClaudeRateLimits | null>,
  });

  return (
    <>
      <div className="flex-1 hidden sm:block">
        {claudeUsage && (
          <HeaderUsageWidget usage={claudeUsage} rateLimits={rateLimits} onClick={() => setUsageDialogOpen(true)} />
        )}
      </div>
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

// ---------------------------------------------------------------------------
// SharedHeader — public component
// ---------------------------------------------------------------------------

export function SharedHeader({
  claudeUsage,
  statusIndicator,
  mobileMenuButton,
}: {
  claudeUsage?: ClaudeUsageActions;
  statusIndicator?: ReactNode;
  mobileMenuButton?: ReactNode;
}) {
  return (
    <header className="h-14 border-b border-border bg-background/80 backdrop-blur-xs sticky top-0 z-30 flex items-center justify-between px-4 sm:px-6 gap-3">
      {/* Mobile: menu button */}
      {mobileMenuButton && <div className="flex items-center gap-2 md:hidden">{mobileMenuButton}</div>}

      {/* Claude usage widget (desktop) */}
      {claudeUsage ? <UsageSection claudeUsage={claudeUsage} /> : <div className="flex-1 hidden sm:block" />}

      {/* Spacer for mobile */}
      <div className="flex-1 sm:hidden" />

      {/* Right actions */}
      <div className="flex items-center gap-1 sm:gap-2">
        {statusIndicator}
        <ThemeToggle />
      </div>
    </header>
  );
}
