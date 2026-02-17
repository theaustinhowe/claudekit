"use client";

import { useIsMobile } from "@devkit/hooks";
import { type ReactNode, useCallback, useState } from "react";
import { AppSidebar } from "./app-sidebar";
import { TopBar } from "./top-bar";

export function AppLayout({ children }: { children: ReactNode }) {
  const _isMobile = useIsMobile();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const toggleSidebar = useCallback(() => setSidebarCollapsed((p) => !p), []);

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
    </div>
  );
}
