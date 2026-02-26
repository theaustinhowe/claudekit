"use client";

import { useIsMobile } from "@claudekit/hooks";
import { cn } from "@claudekit/ui";
import { Button } from "@claudekit/ui/components/button";
import { CollapsibleSidebar, SidebarLogo } from "@claudekit/ui/components/collapsible-sidebar";
import { NavLink } from "@claudekit/ui/components/nav-link";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@claudekit/ui/components/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@claudekit/ui/components/tooltip";
import { Archive, CircleDot, FolderTree, LayoutDashboard, Menu, MoreHorizontal, Search, Settings } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { RepoSelector } from "@/components/repo/repo-selector";
import { useJobs } from "@/hooks/use-jobs";

interface NavItem {
  icon: React.ComponentType<{ className?: string }>;
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

const bottomNavItems = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/" },
  { icon: CircleDot, label: "Issues", href: "/issues" },
  { icon: Search, label: "Research", href: "/research" },
  { icon: FolderTree, label: "Workspaces", href: "/worktrees" },
];

/* ---------- Shared nav for mobile sheet ---------- */

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { data: jobsData } = useJobs();
  const blockedOnYouCount = jobsData?.data?.filter((job) => job.status === "needs_info").length ?? 0;

  return (
    <nav className="flex-1 space-y-1 p-2 overflow-y-auto">
      {navItems.map((item) => {
        const showBlockedBadge = item.href === "/" && blockedOnYouCount > 0;

        return (
          <NavLink
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
            activeClassName="bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
          >
            <item.icon className="h-5 w-5 shrink-0" />
            <span>{item.label}</span>
            {showBlockedBadge && <BlockedBadge count={blockedOnYouCount} />}
          </NavLink>
        );
      })}
    </nav>
  );
}

/* ---------- Mobile components ---------- */

export function MobileMenuButton({ onClick }: { onClick: () => void }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden" onClick={onClick} aria-label="Open menu">
            <Menu className="h-5 w-5" />
            <span className="sr-only">Open menu</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Open menu</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function MobileSidebar({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-60 p-0">
        <SheetHeader className="h-14 flex flex-row items-center px-4 border-b">
          <Link href="/" onClick={() => onOpenChange(false)} className="flex items-center gap-1.5">
            <Image src="/icon.png" alt="GoGo" width={28} height={28} className="h-7 w-7 rounded-md" />
            <SheetTitle className="text-sm font-semibold">GoGo</SheetTitle>
          </Link>
        </SheetHeader>
        <div className="border-b p-3">
          <RepoSelector collapsed={false} />
        </div>
        <SidebarNav onNavigate={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  );
}

export function MobileBottomNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 z-40 md:hidden border-t border-border bg-background/95 backdrop-blur-xs safe-bottom">
        <nav className="flex items-center justify-around h-14 px-1">
          {bottomNavItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/" && pathname?.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground",
                )}
              >
                <item.icon className="w-5 h-5" />
                <span className="text-[10px] font-medium leading-none">{item.label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className="flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors text-muted-foreground"
          >
            <MoreHorizontal className="w-5 h-5" />
            <span className="text-[10px] font-medium leading-none">More</span>
          </button>
        </nav>
      </div>
      <MobileSidebar open={moreOpen} onOpenChange={setMoreOpen} />
    </>
  );
}

/* ---------- Desktop nav item ---------- */

function DesktopNavItem({
  item,
  collapsed,
  blockedOnYouCount,
}: {
  item: NavItem;
  collapsed: boolean;
  blockedOnYouCount: number;
}) {
  const showBlockedBadge = item.href === "/" && blockedOnYouCount > 0;

  const link = (
    <NavLink
      href={item.href}
      className={cn(
        "flex items-center rounded-md transition-colors",
        "hover:bg-accent group relative",
        collapsed ? "justify-center w-10 h-10 mx-auto" : "gap-3 px-3 py-2",
        "text-muted-foreground hover:text-accent-foreground",
      )}
      activeClassName="bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
    >
      <div className="relative shrink-0">
        <item.icon className="h-5 w-5" />
        {showBlockedBadge && collapsed && (
          <span className="absolute -top-1 -right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-orange-500 text-[10px] font-bold text-white px-0.5">
            {blockedOnYouCount}
          </span>
        )}
      </div>
      {!collapsed && <span className="whitespace-nowrap overflow-hidden text-sm font-medium">{item.label}</span>}
      {!collapsed && showBlockedBadge && <BlockedBadge count={blockedOnYouCount} />}
    </NavLink>
  );

  if (!collapsed) return link;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">
        {item.label}
        {showBlockedBadge && ` (${blockedOnYouCount} blocked on you)`}
      </TooltipContent>
    </Tooltip>
  );
}

/* ---------- Desktop sidebar ---------- */

export function AppSidebar() {
  const isMobile = useIsMobile();
  const { data: jobsData } = useJobs();
  const blockedOnYouCount = jobsData?.data?.filter((job) => job.status === "needs_info").length ?? 0;

  if (isMobile) return null;

  return (
    <CollapsibleSidebar expandedWidth={240} toggleTooltip className="h-screen sticky top-0 left-0">
      {({ collapsed }) => (
        <>
          {/* Logo */}
          <Link
            href="/"
            className="h-14 flex items-center justify-center border-b border-sidebar-border overflow-hidden"
          >
            <SidebarLogo
              collapsed={collapsed}
              icon={<Image src="/icon.png" alt="GoGo" width={32} height={32} className="w-8 h-8 rounded-lg" />}
              wordmark={<Image src="/logo.png" alt="GoGo" width={200} height={64} className="h-12 w-auto" />}
            />
          </Link>

          {/* Repository Selector */}
          <div className={cn("border-b", collapsed ? "p-2" : "p-3")}>
            <RepoSelector collapsed={collapsed} />
          </div>

          {/* Navigation */}
          <TooltipProvider delayDuration={0}>
            <nav className="flex-1 space-y-1 p-2">
              {navItems.map((item) => (
                <DesktopNavItem
                  key={item.href}
                  item={item}
                  collapsed={collapsed}
                  blockedOnYouCount={blockedOnYouCount}
                />
              ))}
            </nav>
          </TooltipProvider>
        </>
      )}
    </CollapsibleSidebar>
  );
}

/* ---------- Blocked badge ---------- */

function BlockedBadge({ count }: { count: number }) {
  return (
    <span className="ml-auto flex items-center gap-1.5 rounded-full bg-orange-100 dark:bg-orange-900/50 px-2 py-0.5 text-xs font-medium text-orange-700 dark:text-orange-400">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-75" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-orange-500" />
      </span>
      {count}
    </span>
  );
}
