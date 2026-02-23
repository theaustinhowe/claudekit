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

  const hasData = claudeUsage || rateLimits;

  return (
    <>
      <div className="flex-1 hidden sm:block">
        {hasData && (
          <HeaderUsageWidget
            usage={claudeUsage ?? undefined}
            rateLimits={rateLimits}
            onClick={() => setUsageDialogOpen(true)}
          />
        )}
      </div>
      {hasData && (
        <ClaudeUsageDialog
          open={usageDialogOpen}
          onOpenChange={setUsageDialogOpen}
          usage={claudeUsage ?? undefined}
          rateLimits={rateLimits}
        />
      )}
    </>
  );
}
