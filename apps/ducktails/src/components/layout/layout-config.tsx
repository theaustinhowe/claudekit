import type { AppLayoutConfig, NavGroup } from "@claudekit/ui/components/shared-layout";
import { Database, LayoutDashboard } from "lucide-react";

const navGroups: NavGroup[] = [
  {
    items: [{ label: "Dashboard", href: "/", icon: LayoutDashboard }],
  },
  {
    label: "Databases",
    items: [
      { label: "Gadget", href: "/gadget/tables", icon: Database },
      { label: "Inspector", href: "/inspector/tables", icon: Database },
      { label: "Inside", href: "/inside/tables", icon: Database },
      { label: "B4U", href: "/b4u/tables", icon: Database },
      { label: "GoGo", href: "/gogo/tables", icon: Database },
    ],
  },
];

export const ducktailsLayoutConfig: AppLayoutConfig = {
  appId: "ducktails",
  logo: {
    icon: <Database className="w-6 h-6 text-primary" />,
    wordmark: <span className="text-lg font-bold">DuckTails</span>,
  },
  nav: navGroups,
  bottomNav: [],
  mobileNav: [
    { label: "Dashboard", href: "/", icon: LayoutDashboard },
    { label: "Gadget", href: "/gadget/tables", icon: Database },
    { label: "Inspector", href: "/inspector/tables", icon: Database },
    { label: "B4U", href: "/b4u/tables", icon: Database },
  ],
  port: 2050,
};
