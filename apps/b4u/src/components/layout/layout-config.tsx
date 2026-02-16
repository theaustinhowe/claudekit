import type { AppLayoutConfig } from "@devkit/ui/components/shared-layout";
import { getClaudeRateLimitsAction, getClaudeUsageStatsAction } from "@/lib/actions/claude-usage";

export const b4uLayoutConfig: AppLayoutConfig = {
  appId: "b4u",
  logo: {
    icon: (
      <div className="w-10 h-10 flex items-center justify-center text-2xs font-bold rounded-md bg-primary/10 text-primary">
        B4U
      </div>
    ),
    wordmark: (
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 flex items-center justify-center text-2xs font-bold rounded-md bg-primary/10 text-primary">
          B4U
        </div>
        <span className="text-sm font-semibold tracking-tight text-sidebar-foreground">B4U</span>
      </div>
    ),
  },
  nav: [],
  claudeUsage: {
    getUsageStats: getClaudeUsageStatsAction,
    getRateLimits: getClaudeRateLimitsAction,
  },
  port: 2300,
};
