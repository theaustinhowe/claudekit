import { UsageSection } from "@claudekit/claude-usage/components/usage-section";
import type { AppLayoutConfig, NavGroup } from "@claudekit/ui/components/shared-layout";
import { Archive, FolderKanban, Settings, Sparkles } from "lucide-react";
import Image from "next/image";
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
    icon: <Image src="/favicon-32x32.png" alt="Inside" width={32} height={32} className="w-8 h-8" />,
    wordmark: <Image src="/logo.png" alt="Inside" width={887} height={617} className="h-10 w-auto" />,
  },
  nav: navGroups,
  bottomNav: [{ label: "Settings", href: "/settings", icon: Settings }],
  mobileNav: [
    { label: "Projects", href: "/", icon: FolderKanban },
    { label: "New", href: "/new", icon: Sparkles },
    { label: "Archived", href: "/archived", icon: Archive },
  ],
  usageWidget: <UsageSection getUsageStats={getClaudeUsageStatsAction} getRateLimits={getClaudeRateLimitsAction} />,
  port: 2150,
};
