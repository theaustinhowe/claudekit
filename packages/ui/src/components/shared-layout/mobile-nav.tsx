"use client";

import { Menu, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import { useState } from "react";
import { cn } from "../../utils";
import { Button } from "../button";
import { SidebarLogo } from "../collapsible-sidebar";
import { NavLink } from "../nav-link";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "../sheet";
import type { AppLayoutConfig, NavGroup, NavItem } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isNavGroupArray(nav: NavItem[] | NavGroup[]): nav is NavGroup[] {
  if (nav.length === 0) return false;
  return "items" in nav[0];
}

function flattenNav(nav: NavItem[] | NavGroup[]): NavItem[] {
  if (!isNavGroupArray(nav)) return nav;
  return nav.flatMap((g) => g.items);
}

// ---------------------------------------------------------------------------
// Mobile nav for sheet sidebar
// ---------------------------------------------------------------------------

function MobileSheetNav({ nav, onNavigate }: { nav: NavItem[] | NavGroup[]; onNavigate: () => void }) {
  const items = flattenNav(nav);

  return (
    <nav className="flex-1 space-y-1 p-2 overflow-y-auto">
      {items.map((item) => (
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
        </NavLink>
      ))}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// MobileMenuButton
// ---------------------------------------------------------------------------

export function MobileMenuButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" size="icon" className="md:hidden" onClick={onClick}>
      <Menu className="h-5 w-5" />
      <span className="sr-only">Open menu</span>
    </Button>
  );
}

// ---------------------------------------------------------------------------
// MobileSidebar — sheet drawer
// ---------------------------------------------------------------------------

export function MobileSidebar({
  config,
  open,
  onOpenChange,
  contextSwitcher: ContextSwitcher,
  mobileSidebarContent: MobileSidebarContent,
}: {
  config: AppLayoutConfig;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contextSwitcher?: ComponentType<{ collapsed: boolean }>;
  mobileSidebarContent?: ComponentType<{ onNavigate: () => void }>;
}) {
  const onNavigate = () => onOpenChange(false);
  const logoHref = config.logo.href ?? "/";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-64 p-0">
        <SheetHeader className="h-14 flex flex-row items-center px-4 border-b border-sidebar-border">
          <Link href={logoHref} onClick={onNavigate} className="flex items-center gap-2">
            <SidebarLogo collapsed={false} icon={config.logo.icon} wordmark={config.logo.wordmark} />
            <SheetTitle className="sr-only">{config.appId}</SheetTitle>
          </Link>
        </SheetHeader>

        {ContextSwitcher && (
          <div className="border-b p-3">
            <ContextSwitcher collapsed={false} />
          </div>
        )}

        {MobileSidebarContent ? (
          <MobileSidebarContent onNavigate={onNavigate} />
        ) : (
          <MobileSheetNav nav={config.nav} onNavigate={onNavigate} />
        )}
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// MobileBottomNav — fixed bottom bar
// ---------------------------------------------------------------------------

export function MobileBottomNav({
  config,
  contextSwitcher,
  mobileSidebarContent,
}: {
  config: AppLayoutConfig;
  contextSwitcher?: ComponentType<{ collapsed: boolean }>;
  mobileSidebarContent?: ComponentType<{ onNavigate: () => void }>;
}) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const mobileItems = config.mobileNav ?? flattenNav(config.nav).slice(0, 4);

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 z-40 md:hidden border-t border-border bg-background/95 backdrop-blur-xs safe-bottom">
        <nav className="flex items-center justify-around h-14 px-1">
          {mobileItems.map((item) => {
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
      <MobileSidebar
        config={config}
        open={moreOpen}
        onOpenChange={setMoreOpen}
        contextSwitcher={contextSwitcher}
        mobileSidebarContent={mobileSidebarContent}
      />
    </>
  );
}
