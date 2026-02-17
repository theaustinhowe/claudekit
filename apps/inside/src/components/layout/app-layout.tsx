"use client";

import { useIsMobile } from "@devkit/hooks";
import { type ReactNode, useCallback, useState } from "react";
import { AppSidebar } from "./app-sidebar";
import { RightDrawer } from "./right-drawer";
import { TopBar } from "./top-bar";

export type DrawerType = "skill" | "diff" | null;

interface DrawerState {
  open: boolean;
  type: DrawerType;
  data: unknown;
}

export function AppLayout({ children }: { children: ReactNode }) {
  const _isMobile = useIsMobile();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [drawer, setDrawer] = useState<DrawerState>({ open: false, type: null, data: null });

  const toggleSidebar = useCallback(() => setSidebarCollapsed((p) => !p), []);
  const _openDrawer = useCallback((type: "skill" | "diff", data: unknown) => setDrawer({ open: true, type, data }), []);
  const closeDrawer = useCallback(() => setDrawer({ open: false, type: null, data: null }), []);

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <TopBar
        sidebarCollapsed={sidebarCollapsed}
        toggleSidebar={toggleSidebar}
        mobileSidebarOpen={mobileSidebarOpen}
        setMobileSidebarOpen={setMobileSidebarOpen}
      />
      <div className="flex flex-1 overflow-hidden">
        <AppSidebar
          collapsed={sidebarCollapsed}
          mobileOpen={mobileSidebarOpen}
          onMobileClose={() => setMobileSidebarOpen(false)}
        />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
      <RightDrawer drawer={drawer} onClose={closeDrawer} />
    </div>
  );
}

// Re-export drawer helpers for page components
export type { DrawerState };
