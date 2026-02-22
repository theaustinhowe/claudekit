import { UsageSection } from "@devkit/claude-usage/components/usage-section";
import type { AppLayoutConfig, NavItem } from "@devkit/ui/components/shared-layout";
import { Archive, CircleDot, FolderTree, LayoutDashboard, Search, Settings } from "lucide-react";
import Image from "next/image";
import { getClaudeRateLimitsAction, getClaudeUsageStatsAction } from "@/lib/actions/claude-usage";

const navItems: NavItem[] = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/" },
  { icon: CircleDot, label: "Issues", href: "/issues" },
  { icon: Search, label: "Research", href: "/research" },
  { icon: FolderTree, label: "Workspaces", href: "/worktrees" },
  { icon: Archive, label: "Archive", href: "/archive" },
  { icon: Settings, label: "Settings", href: "/settings" },
];

export const gogoLayoutConfig: AppLayoutConfig = {
  appId: "gogo-web",
  logo: {
    icon: <Image src="/icon.png" alt="GoGo" width={32} height={32} className="w-8 h-8 rounded-lg" />,
    wordmark: <Image src="/logo.png" alt="GoGo" width={200} height={64} className="h-12 w-auto" />,
  },
  nav: navItems,
  mobileNav: [
    { icon: LayoutDashboard, label: "Dashboard", href: "/" },
    { icon: CircleDot, label: "Issues", href: "/issues" },
    { icon: Search, label: "Research", href: "/research" },
    { icon: FolderTree, label: "Workspaces", href: "/worktrees" },
  ],
  usageWidget: <UsageSection getUsageStats={getClaudeUsageStatsAction} getRateLimits={getClaudeRateLimitsAction} />,
  port: 2200,
};
