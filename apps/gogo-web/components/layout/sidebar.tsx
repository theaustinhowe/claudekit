"use client";

import {
  Archive,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  FolderTree,
  LayoutDashboard,
  Search,
  Settings,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { RepoSelector } from "@/components/repo/repo-selector";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useJobs } from "@/hooks/use-jobs";
import { cn } from "@/lib/utils";

const SIDEBAR_COLLAPSED_KEY = "sidebar-collapsed";

interface NavItem {
  icon: React.ElementType;
  label: string;
  href: string;
}

const navItems: NavItem[] = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/" },
  { icon: CircleDot, label: "Issues", href: "/issues" },
  { icon: Search, label: "Research", href: "/research" },
  { icon: FolderTree, label: "Workspaces", href: "/worktrees" },
  { icon: Archive, label: "Archive", href: "/archive" },
  { icon: Settings, label: "Settings", href: "/settings" },
];

interface SidebarProps {
  className?: string;
}

export function Sidebar({ className }: SidebarProps) {
  const pathname = usePathname();
  const { data: jobsData } = useJobs();
  const [collapsed, setCollapsed] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  // Count jobs blocked on user (needs_info)
  const blockedOnYouCount = jobsData?.data?.filter((job) => job.status === "needs_info").length ?? 0;

  // Load collapsed state from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    if (stored !== null) {
      setCollapsed(stored === "true");
    }
  }, []);

  // Save collapsed state to localStorage
  const toggleCollapsed = () => {
    const newValue = !collapsed;
    setCollapsed(newValue);
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(newValue));
  };

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "relative z-20 flex h-full flex-col bg-card/50 backdrop-blur-sm border-r transition-all duration-base",
          collapsed ? "w-16" : "w-60",
          className,
        )}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Collapse nub on right edge */}
        <button
          type="button"
          onClick={toggleCollapsed}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              toggleCollapsed();
            }
          }}
          className={cn(
            "absolute right-0 top-1/2 z-10 -translate-y-1/2 translate-x-1/2",
            "h-6 w-6 rounded-full bg-primary text-primary-foreground shadow-sm",
            "flex items-center justify-center cursor-pointer",
            "transition-opacity duration-200 hover:bg-primary/80",
            "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus-visible:opacity-100",
            isHovered ? "opacity-100" : "opacity-0",
          )}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
        </button>

        {/* Logo/Brand */}
        <Link href="/" className="h-14 flex items-center justify-center border-b overflow-hidden">
          {collapsed ? (
            <Image src="/icon.png" alt="GoGo" width={32} height={32} className="w-8 h-8 rounded-lg" />
          ) : (
            <Image src="/logo.png" alt="GoGo" width={200} height={64} className="h-12 w-auto" />
          )}
        </Link>

        {/* Repository Selector */}
        <div className={cn("border-b", collapsed ? "p-2" : "p-3")}>
          <RepoSelector collapsed={collapsed} />
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 p-2">
          {navItems.map((item) => {
            const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const Icon = item.icon;
            // Show blocked-on-you badge on Dashboard
            const showBlockedBadge = item.href === "/" && blockedOnYouCount > 0;

            const button = (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  collapsed && "justify-center px-2",
                )}
              >
                <div className="relative shrink-0">
                  <Icon className="h-5 w-5" />
                  {showBlockedBadge && collapsed && (
                    <span className="absolute -top-1 -right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-orange-500 text-[10px] font-bold text-white px-0.5">
                      {blockedOnYouCount}
                    </span>
                  )}
                </div>
                {!collapsed && (
                  <>
                    <span>{item.label}</span>
                    {showBlockedBadge && (
                      <span className="ml-auto flex items-center gap-1.5 rounded-full bg-orange-100 dark:bg-orange-900/50 px-2 py-0.5 text-xs font-medium text-orange-700 dark:text-orange-400">
                        <span className="relative flex h-1.5 w-1.5">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-75" />
                          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-orange-500" />
                        </span>
                        {blockedOnYouCount}
                      </span>
                    )}
                  </>
                )}
              </Link>
            );

            if (collapsed) {
              return (
                <Tooltip key={item.href}>
                  <TooltipTrigger asChild>{button}</TooltipTrigger>
                  <TooltipContent side="right">
                    <p>
                      {item.label}
                      {showBlockedBadge && ` (${blockedOnYouCount} blocked on you)`}
                    </p>
                  </TooltipContent>
                </Tooltip>
              );
            }

            return button;
          })}
        </nav>
      </aside>
    </TooltipProvider>
  );
}
