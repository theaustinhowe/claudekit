import type { AppLayoutConfig, NavGroup } from "@devkit/ui/components/shared-layout";
import { Brain, GitBranch, LayoutDashboard, MessageSquareCode, Settings } from "lucide-react";
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
    ],
  },
];

export const insideLayoutConfig: AppLayoutConfig = {
  appId: "inside",
  logo: {
    icon: (
      <div className="h-8 w-8 rounded-lg gradient-primary flex items-center justify-center">
        <span className="text-sm font-bold text-primary-foreground">IN</span>
      </div>
    ),
    wordmark: (
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-lg gradient-primary flex items-center justify-center">
          <span className="text-sm font-bold text-primary-foreground">IN</span>
        </div>
        <span className="text-lg font-bold text-gradient">Inside</span>
      </div>
    ),
  },
  nav: navGroups,
  bottomNav: [{ label: "Settings", href: "/settings", icon: Settings }],
  mobileNav: [
    { label: "Dashboard", href: "/", icon: LayoutDashboard },
    { label: "Skills", href: "/skills", icon: Brain },
    { label: "Splitter", href: "/splitter", icon: GitBranch },
    { label: "Resolver", href: "/resolver", icon: MessageSquareCode },
  ],
  claudeUsage: {
    getUsageStats: getClaudeUsageStatsAction,
    getRateLimits: getClaudeRateLimitsAction,
  },
  port: 2400,
};
