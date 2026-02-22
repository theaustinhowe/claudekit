import { UsageSection } from "@claudekit/claude-usage/components/usage-section";
import type { AppLayoutConfig, NavGroup } from "@claudekit/ui/components/shared-layout";
import { Archive, FolderKanban, Settings, Sparkles } from "lucide-react";
import { getClaudeRateLimitsAction, getClaudeUsageStatsAction } from "@/lib/actions/claude-usage";

const navGroups: NavGroup[] = [
  {
    items: [
      { label: "Projects", href: "/", icon: FolderKanban },
      { label: "New", href: "/new", icon: Sparkles },
    ],
  },
  {
    label: "More",
    items: [{ label: "Archived", href: "/archived", icon: Archive }],
  },
];

export const insideLayoutConfig: AppLayoutConfig = {
  appId: "inside",
  logo: {
    icon: <Sparkles className="w-6 h-6 text-primary" />,
    wordmark: <span className="text-xl font-bold tracking-tight">Inside</span>,
  },
  nav: navGroups,
  bottomNav: [{ label: "Settings", href: "/settings", icon: Settings }],
  mobileNav: [
    { label: "Projects", href: "/", icon: FolderKanban },
    { label: "New", href: "/new", icon: Sparkles },
    { label: "Archived", href: "/archived", icon: Archive },
  ],
  usageWidget: <UsageSection getUsageStats={getClaudeUsageStatsAction} getRateLimits={getClaudeRateLimitsAction} />,
  port: 2500,
};
