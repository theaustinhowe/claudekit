import { UsageSection } from "@claudekit/claude-usage/components/usage-section";
import type { AppLayoutConfig, NavGroup } from "@claudekit/ui/components/shared-layout";
import { Brain, GitBranch, GitPullRequest, LayoutDashboard, MessageSquareCode, Settings, Users } from "lucide-react";
import { getClaudeRateLimitsAction, getClaudeUsageStatsAction } from "@/lib/actions/claude-usage";

const navGroups: NavGroup[] = [
  {
    items: [{ label: "Dashboard", href: "/", icon: LayoutDashboard }],
  },
  {
    label: "Analyze",
    items: [
      { label: "Skill Builder", href: "/skills", icon: Brain },
      { label: "PR Splitter", href: "/splitter", icon: GitBranch },
      { label: "Comment Resolver", href: "/resolver", icon: MessageSquareCode },
      { label: "Reviewer Insights", href: "/insights", icon: Users },
    ],
  },
];

export const inspectorLayoutConfig: AppLayoutConfig = {
  appId: "inspector",
  logo: {
    icon: <GitPullRequest className="w-6 h-6 text-primary" />,
    wordmark: <span className="text-xl font-bold tracking-tight">Inspector</span>,
  },
  nav: navGroups,
  bottomNav: [{ label: "Settings", href: "/settings", icon: Settings }],
  mobileNav: [
    { label: "Dashboard", href: "/", icon: LayoutDashboard },
    { label: "Skills", href: "/skills", icon: Brain },
    { label: "Splitter", href: "/splitter", icon: GitBranch },
    { label: "Resolver", href: "/resolver", icon: MessageSquareCode },
  ],
  usageWidget: <UsageSection getUsageStats={getClaudeUsageStatsAction} getRateLimits={getClaudeRateLimitsAction} />,
  port: 2400,
};
