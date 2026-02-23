import { UsageSection } from "@claudekit/claude-usage/components/usage-section";
import type { AppLayoutConfig, NavGroup } from "@claudekit/ui/components/shared-layout";
import { FolderGit2, Hammer, LayoutDashboard, Puzzle, ScanSearch, Settings, Shield } from "lucide-react";
import Image from "next/image";
import { getClaudeRateLimitsAction, getClaudeUsageStatsAction } from "@/lib/actions/claude-usage";

const navGroups: NavGroup[] = [
  {
    items: [{ label: "Dashboard", href: "/", icon: LayoutDashboard }],
  },
  {
    label: "Audit",
    items: [
      { label: "New Scan", href: "/scans", icon: ScanSearch },
      { label: "Repos", href: "/repositories", icon: FolderGit2 },
    ],
  },
  {
    label: "Integrations",
    items: [{ label: "AI Integrations", href: "/ai-integrations", icon: Puzzle }],
  },
  {
    label: "Setup",
    items: [
      { label: "Policies", href: "/policies", icon: Shield },
      { label: "Toolbox", href: "/toolbox", icon: Hammer },
      { label: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

export const gadgetLayoutConfig: AppLayoutConfig = {
  appId: "gadget",
  logo: {
    icon: <Image src="/images/logo-icon.png" alt="Gadget" width={32} height={32} className="w-8 h-8" />,
    wordmark: <Image src="/images/logo.png" alt="Gadget" width={1054} height={413} className="h-10 w-auto" />,
  },
  nav: navGroups,
  bottomNav: [],
  mobileNav: [
    { label: "Dashboard", href: "/", icon: LayoutDashboard },
    { label: "New Scan", href: "/scans", icon: ScanSearch },
    { label: "Repos", href: "/repositories", icon: FolderGit2 },
  ],
  usageWidget: <UsageSection getUsageStats={getClaudeUsageStatsAction} getRateLimits={getClaudeRateLimitsAction} />,
  port: 2100,
};
