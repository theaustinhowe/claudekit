import { UsageSection } from "@claudekit/claude-usage/components/usage-section";
import type { AppLayoutConfig, NavGroup } from "@claudekit/ui/components/shared-layout";
import { Brain, GitBranch, LayoutDashboard, MessageSquareCode, Settings, Users } from "lucide-react";
import Image from "next/image";
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
  {
    items: [{ label: "Settings", href: "/settings", icon: Settings }],
  },
];

export const inspectorLayoutConfig: AppLayoutConfig = {
  appId: "inspector",
  logo: {
    icon: <Image src="/favicon-16x16.png" alt="Inspector" width={16} height={16} className="w-6 h-6" />,
    wordmark: <Image src="/logo.png" alt="Inspector" width={512} height={512} className="h-10 w-auto" />,
  },
  nav: navGroups,
  mobileNav: [
    { label: "Dashboard", href: "/", icon: LayoutDashboard },
    { label: "Skills", href: "/skills", icon: Brain },
    { label: "Splitter", href: "/splitter", icon: GitBranch },
    { label: "Resolver", href: "/resolver", icon: MessageSquareCode },
  ],
  usageWidget: <UsageSection getUsageStats={getClaudeUsageStatsAction} getRateLimits={getClaudeRateLimitsAction} />,
  port: 2400,
};
