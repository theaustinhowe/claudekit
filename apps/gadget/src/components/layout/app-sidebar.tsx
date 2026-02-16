"use client";

import { useIsMobile } from "@devkit/hooks";
import { cn } from "@devkit/ui";
import { Button } from "@devkit/ui/components/button";
import { CollapsibleSidebar, SidebarLogo } from "@devkit/ui/components/collapsible-sidebar";
import { NavLink } from "@devkit/ui/components/nav-link";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@devkit/ui/components/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@devkit/ui/components/tooltip";
import {
  FolderGit2,
  FolderKanban,
  Hammer,
  LayoutDashboard,
  Menu,
  MoreHorizontal,
  Puzzle,
  ScanSearch,
  Settings,
  Shield,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

interface NavItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavGroup {
  label?: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    items: [{ title: "Dashboard", url: "/", icon: LayoutDashboard }],
  },
  {
    label: "Audit",
    items: [
      { title: "New Scan", url: "/scans", icon: ScanSearch },
      { title: "Repos", url: "/repositories", icon: FolderGit2 },
    ],
  },
  {
    label: "Build",
    items: [
      { title: "Projects", url: "/projects", icon: FolderKanban },
      { title: "AI Integrations", url: "/ai-integrations", icon: Puzzle },
    ],
  },
  {
    label: "Setup",
    items: [
      { title: "Policies", url: "/policies", icon: Shield },
      { title: "Toolbox", url: "/toolbox", icon: Hammer },
    ],
  },
];

const bottomNavItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "New Scan", url: "/scans", icon: ScanSearch },
  { title: "Repos", url: "/repositories", icon: FolderGit2 },
  { title: "Projects", url: "/projects", icon: FolderKanban },
];

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex-1 py-2 px-2 overflow-y-auto">
      {navGroups.map((group) => (
        <div key={group.label ?? "ungrouped"}>
          {group.label && (
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground/60 px-3 pt-4 pb-1">
              {group.label}
            </div>
          )}
          <div className="space-y-1">
            {group.items.map((item) => {
              const isActive = pathname === item.url || (item.url !== "/" && pathname?.startsWith(item.url));

              return (
                <NavLink
                  key={item.url}
                  href={item.url}
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200",
                    "hover:bg-sidebar-accent group relative",
                    isActive && "bg-sidebar-accent text-sidebar-accent-foreground",
                    !isActive && "text-sidebar-foreground/70",
                  )}
                  activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                >
                  <item.icon className="w-5 h-5 flex-shrink-0 transition-colors" />
                  <span className="whitespace-nowrap overflow-hidden">{item.title}</span>
                </NavLink>
              );
            })}
          </div>
        </div>
      ))}
      {/* Settings at bottom of nav groups */}
      <div className="mt-2">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground/60 px-3 pt-4 pb-1"></div>
        <div className="space-y-1">
          {(() => {
            const isActive = pathname === "/settings" || pathname?.startsWith("/settings");
            return (
              <NavLink
                href="/settings"
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200",
                  "hover:bg-sidebar-accent group relative",
                  isActive && "bg-sidebar-accent text-sidebar-accent-foreground",
                  !isActive && "text-sidebar-foreground/70",
                )}
                activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
              >
                <Settings className="w-5 h-5 flex-shrink-0 transition-colors" />
                <span className="whitespace-nowrap overflow-hidden">Settings</span>
              </NavLink>
            );
          })()}
        </div>
      </div>
    </nav>
  );
}

export function MobileMenuButton({ onClick }: { onClick: () => void }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden" onClick={onClick}>
            <Menu className="w-5 h-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Menu</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function MobileSidebar({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-64 p-0">
        <SheetHeader className="h-14 flex flex-row items-center px-4 border-b border-sidebar-border">
          <Link href="/" onClick={() => onOpenChange(false)} className="flex items-center gap-2">
            <Image src="/images/logo-icon.png" alt="Gadget" width={32} height={32} className="w-8 h-8 flex-shrink-0" />
            <SheetTitle className="sr-only">Gadget</SheetTitle>
            <Image src="/images/logo.png" alt="Gadget" width={1054} height={413} className="h-7 w-auto" />
          </Link>
        </SheetHeader>
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
            const isActive = pathname === item.url || (item.url !== "/" && pathname?.startsWith(item.url));

            return (
              <Link
                key={item.url}
                href={item.url}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground",
                )}
              >
                <item.icon className="w-5 h-5" />
                <span className="text-[10px] font-medium leading-none">{item.title}</span>
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

function DesktopNavItem({ item, collapsed, isActive }: { item: NavItem; collapsed: boolean; isActive: boolean }) {
  const link = (
    <NavLink
      href={item.url}
      className={cn(
        "flex items-center rounded-lg transition-colors duration-200",
        "hover:bg-sidebar-accent group relative",
        collapsed ? "justify-center w-10 h-10 mx-auto" : "gap-3 px-3 py-2",
        isActive && "bg-sidebar-accent text-sidebar-accent-foreground",
        !isActive && "text-sidebar-foreground/70",
      )}
      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
    >
      <item.icon className="w-5 h-5 flex-shrink-0 transition-colors" />
      <AnimatePresence>
        {!collapsed && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="whitespace-nowrap overflow-hidden"
          >
            {item.title}
          </motion.span>
        )}
      </AnimatePresence>
    </NavLink>
  );

  if (!collapsed) return link;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.title}</TooltipContent>
    </Tooltip>
  );
}

function DesktopNav({ collapsed }: { collapsed: boolean }) {
  const pathname = usePathname();

  return (
    <TooltipProvider delayDuration={0}>
      <nav className="flex-1 py-2 px-2 overflow-y-auto">
        {navGroups.map((group) => (
          <div key={group.label ?? "ungrouped"}>
            {group.label && !collapsed && (
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground/60 px-3 pt-4 pb-1">
                {group.label}
              </div>
            )}
            <div className={cn("space-y-1", group.label && collapsed && "mt-3")}>
              {group.items.map((item) => {
                const isActive = pathname === item.url || (item.url !== "/" && pathname?.startsWith(item.url));
                return <DesktopNavItem key={item.url} item={item} collapsed={collapsed} isActive={isActive} />;
              })}
            </div>
          </div>
        ))}
        {/* Settings rendered separately at bottom of nav */}
        <div className="mt-5">
          {(() => {
            const isActive = pathname === "/settings" || pathname?.startsWith("/settings");
            return (
              <DesktopNavItem
                item={{ title: "Settings", url: "/settings", icon: Settings }}
                collapsed={collapsed}
                isActive={isActive}
              />
            );
          })()}
        </div>
      </nav>
    </TooltipProvider>
  );
}

export function AppSidebar() {
  const isMobile = useIsMobile();

  if (isMobile) return null;

  return (
    <CollapsibleSidebar expandedWidth={240} toggleTooltip className="h-screen sticky top-0 left-0">
      {({ collapsed }) => (
        <>
          <Link
            href="/"
            className="h-14 flex items-center justify-center px-4 border-b border-sidebar-border overflow-hidden"
          >
            <SidebarLogo
              collapsed={collapsed}
              icon={<Image src="/images/logo-icon.png" alt="Gadget" width={32} height={32} className="w-8 h-8" />}
              wordmark={<Image src="/images/logo.png" alt="Gadget" width={1054} height={413} className="h-10 w-auto" />}
            />
          </Link>
          <DesktopNav collapsed={collapsed} />
        </>
      )}
    </CollapsibleSidebar>
  );
}
