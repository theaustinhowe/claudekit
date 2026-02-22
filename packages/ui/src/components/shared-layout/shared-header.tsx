"use client";

import type { ReactNode } from "react";
import { ThemeToggle } from "../theme-toggle";

export function SharedHeader({
  usageWidget,
  statusIndicator,
  mobileMenuButton,
}: {
  usageWidget?: ReactNode;
  statusIndicator?: ReactNode;
  mobileMenuButton?: ReactNode;
}) {
  return (
    <header className="h-14 border-b border-border bg-background/80 backdrop-blur-xs sticky top-0 z-30 flex items-center justify-between px-4 sm:px-6 gap-3">
      {/* Mobile: menu button */}
      {mobileMenuButton && <div className="flex items-center gap-2 md:hidden">{mobileMenuButton}</div>}

      {/* Claude usage widget (desktop) */}
      {usageWidget ?? <div className="flex-1 hidden sm:block" />}

      {/* Spacer for mobile */}
      <div className="flex-1 sm:hidden" />

      {/* Right actions */}
      <div className="flex items-center gap-1 sm:gap-2">
        {statusIndicator}
        <ThemeToggle />
      </div>
    </header>
  );
}
