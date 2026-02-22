import { UsageSection } from "@devkit/claude-usage/components/usage-section";
import type { AppLayoutConfig } from "@devkit/ui/components/shared-layout";
import Image from "next/image";
import { getClaudeRateLimitsAction, getClaudeUsageStatsAction } from "@/lib/actions/claude-usage";

export const b4uLayoutConfig: AppLayoutConfig = {
  appId: "b4u",
  logo: {
    icon: <Image src="/favicon-32x32.png" alt="B4U" width={32} height={32} className="w-8 h-8" />,
    wordmark: <Image src="/logo.png" alt="B4U" width={859} height={529} className="h-10 w-auto" />,
  },
  nav: [],
  usageWidget: <UsageSection getUsageStats={getClaudeUsageStatsAction} getRateLimits={getClaudeRateLimitsAction} />,
  port: 2300,
};
