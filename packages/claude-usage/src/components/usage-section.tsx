"use client";

import { useClaudeUsageRefresh } from "@claudekit/hooks";
import type { ClaudeRateLimits, ClaudeUsageStats } from "../types";
import { ClaudeUsageDialog, HeaderUsageWidget } from "./usage-shared";

export function UsageSection({
  getUsageStats,
  getRateLimits,
}: {
  getUsageStats: () => Promise<ClaudeUsageStats | null>;
  getRateLimits: () => Promise<ClaudeRateLimits | null>;
}) {
  const { claudeUsage, rateLimits, usageDialogOpen, setUsageDialogOpen } = useClaudeUsageRefresh({
    getUsageStats,
    getRateLimits,
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
