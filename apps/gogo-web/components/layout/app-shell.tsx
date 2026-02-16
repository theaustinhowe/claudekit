"use client";

import { ClaudeUsageDialog, HeaderUsageWidget } from "@devkit/claude-usage/components/usage-shared";
import { useClaudeUsageRefresh } from "@devkit/hooks";
import { ThemeToggle } from "@devkit/ui/components/theme-toggle";
import { useState } from "react";
import { getClaudeRateLimitsAction, getClaudeUsageStatsAction } from "@/lib/actions/claude-usage";
import { ConnectionBadge } from "./connection-badge";
import { MobileMenuButton, MobileSidebar } from "./sidebar";

export function AppHeader() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { claudeUsage, rateLimits, usageDialogOpen, setUsageDialogOpen } = useClaudeUsageRefresh({
    getUsageStats: getClaudeUsageStatsAction,
    getRateLimits: getClaudeRateLimitsAction,
  });

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
        <div className="flex items-center gap-2">
          <ConnectionBadge />
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
