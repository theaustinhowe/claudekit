"use client";

import { useIsMobile } from "@devkit/hooks";
import { Button } from "@devkit/ui/components/button";
import { Menu, PanelLeft, PanelLeftClose } from "lucide-react";

interface TopBarProps {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  mobileSidebarOpen: boolean;
  setMobileSidebarOpen: (open: boolean) => void;
}

export function TopBar({ sidebarCollapsed, toggleSidebar, mobileSidebarOpen, setMobileSidebarOpen }: TopBarProps) {
  const isMobile = useIsMobile();

  return (
    <header className="h-14 border-b bg-card flex items-center px-4 gap-3 shrink-0 z-20">
      {isMobile ? (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
          className="shrink-0"
        >
          <Menu className="h-5 w-5" />
        </Button>
      ) : (
        <Button variant="ghost" size="icon" onClick={toggleSidebar} className="shrink-0">
          {sidebarCollapsed ? <PanelLeft className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
        </Button>
      )}

      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-lg gradient-primary flex items-center justify-center">
          <span className="text-sm font-bold text-primary-foreground">IN</span>
        </div>
        <span className="text-lg font-bold text-gradient hidden sm:inline">Inside</span>
      </div>

      <div className="flex items-center gap-1.5 text-xs text-muted-foreground ml-auto">
        <div className="h-2 w-2 rounded-full bg-status-success" />
        <span className="hidden lg:inline">Ready</span>
      </div>
    </header>
  );
}
