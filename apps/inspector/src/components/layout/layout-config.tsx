import { UsageSection } from "@devkit/claude-usage/components/usage-section";
import type { AppLayoutConfig, NavGroup } from "@devkit/ui/components/shared-layout";
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
];

export const inspectorLayoutConfig: AppLayoutConfig = {
  appId: "inspector",
  logo: {
    icon: <Image src="/favicon-32x32.png" alt="Inspector" width={32} height={32} className="w-8 h-8" />,
    wordmark: <Image src="/logo.png" alt="Inspector" width={887} height={617} className="h-10 w-auto" />,
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
