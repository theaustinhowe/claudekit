"use client";

import { useIsMobile } from "@claudekit/hooks";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ComponentType, createElement, type ReactNode } from "react";
import { cn } from "../../utils";
import { CollapsibleSidebar, SidebarLogo } from "../collapsible-sidebar";
import { NavLink } from "../nav-link";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../tooltip";
import type { AppLayoutConfig, NavGroup, NavItem } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isNavGroupArray(nav: NavItem[] | NavGroup[]): nav is NavGroup[] {
  if (nav.length === 0) return false;
  return "items" in nav[0];
}

function normalizeNav(nav: NavItem[] | NavGroup[]): NavGroup[] {
  if (isNavGroupArray(nav)) return nav;
  return [{ items: nav }];
}

// ---------------------------------------------------------------------------
// Desktop nav item — collapsed shows tooltip, expanded shows animated label
// ---------------------------------------------------------------------------

function DesktopNavItem({ item, collapsed, isActive }: { item: NavItem; collapsed: boolean; isActive: boolean }) {
  const Badge = item.badge;
  const badgeNode =
    Badge && typeof Badge === "function"
      ? createElement(Badge as ComponentType<{ collapsed: boolean }>, { collapsed })
      : (Badge as ReactNode);

  const link = (
    <NavLink
      href={item.href}
      className={cn(
        "flex items-center rounded-lg transition-colors duration-200",
        "hover:bg-sidebar-accent group relative",
        collapsed ? "justify-center w-10 h-10 mx-auto" : "gap-3 px-3 py-2",
        isActive && "bg-sidebar-accent text-sidebar-accent-foreground",
        !isActive && "text-sidebar-foreground/70",
      )}
      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
    >
      <div className="relative shrink-0">
        <item.icon className="w-5 h-5 flex-shrink-0 transition-colors" />
        {collapsed && badgeNode && <span className="absolute -top-1.5 -right-1.5">{badgeNode}</span>}
      </div>
      <AnimatePresence>
        {!collapsed && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="whitespace-nowrap overflow-hidden"
          >
            {item.label}
          </motion.span>
        )}
      </AnimatePresence>
      {!collapsed && badgeNode && <span className="ml-auto">{badgeNode}</span>}
    </NavLink>
  );

  if (!collapsed) return link;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}

// ---------------------------------------------------------------------------
// Desktop nav section — renders NavGroup[] with section labels
// ---------------------------------------------------------------------------

function DesktopNav({ groups, collapsed }: { groups: NavGroup[]; collapsed: boolean }) {
  const pathname = usePathname();

  return (
    <TooltipProvider delayDuration={0}>
      <nav className="flex-1 py-2 px-2 overflow-y-auto">
        {groups.map((group) => (
          <div key={group.label ?? "ungrouped"}>
            {group.label && !collapsed && (
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground/60 px-3 pt-4 pb-1">
                {group.label}
              </div>
            )}
            <div className={cn("space-y-1", group.label && collapsed && "mt-3")}>
              {group.items.map((item) => {
                const isActive = pathname === item.href || (item.href !== "/" && pathname?.startsWith(item.href));
                return <DesktopNavItem key={item.href} item={item} collapsed={collapsed} isActive={isActive} />;
              })}
            </div>
          </div>
        ))}
      </nav>
    </TooltipProvider>
  );
}

// ---------------------------------------------------------------------------
// SharedSidebar — public component
// ---------------------------------------------------------------------------

export function SharedSidebar({
  config,
  contextSwitcher: ContextSwitcher,
  sidebarContent: SidebarContent,
}: {
  config: AppLayoutConfig;
  contextSwitcher?: ComponentType<{ collapsed: boolean }>;
  sidebarContent?: ComponentType<{ collapsed: boolean }>;
}) {
  const isMobile = useIsMobile();

  if (isMobile) return null;

  const groups = normalizeNav(config.nav);
  const logoHref = config.logo.href ?? "/";

  return (
    <CollapsibleSidebar
      expandedWidth={240}
      storageKey={`${config.appId}-sidebar-collapsed`}
      toggleTooltip
      className="h-screen sticky top-0 left-0"
    >
      {({ collapsed }) => (
        <>
          {/* Logo */}
          <Link
            href={logoHref}
            className="h-14 flex items-center justify-center px-4 border-b border-sidebar-border overflow-hidden"
          >
            <SidebarLogo collapsed={collapsed} icon={config.logo.icon} wordmark={config.logo.wordmark} />
          </Link>

          {/* Context switcher slot (e.g. RepoSelector) */}
          {ContextSwitcher && (
            <div className={cn("border-b", collapsed ? "p-2" : "p-3")}>
              <ContextSwitcher collapsed={collapsed} />
            </div>
          )}

          {/* Nav or custom sidebar content */}
          {SidebarContent ? (
            <SidebarContent collapsed={collapsed} />
          ) : (
            <DesktopNav groups={groups} bottomNav={config.bottomNav} collapsed={collapsed} />
          )}
        </>
      )}
    </CollapsibleSidebar>
  );
}
