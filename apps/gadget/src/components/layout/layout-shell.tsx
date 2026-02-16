"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";
import { SessionProvider } from "@/components/sessions/session-context";
import { SessionPanel } from "@/components/sessions/session-panel";

const AppSidebar = dynamic(() => import("@/components/layout/app-sidebar").then((m) => m.AppSidebar), { ssr: false });

const MobileBottomNav = dynamic(() => import("@/components/layout/app-sidebar").then((m) => m.MobileBottomNav), {
  ssr: false,
});

const AppHeader = dynamic(() => import("@/components/layout/app-header").then((m) => m.AppHeader), { ssr: false });

export function LayoutShell({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <div className="flex min-h-screen">
        <Suspense>
          <AppSidebar />
        </Suspense>
        <div className="flex-1 flex flex-col min-w-0">
          <Suspense>
            <AppHeader />
          </Suspense>
          <main className="flex-1 min-h-0 pb-16 md:pb-0">{children}</main>
        </div>
      </div>
      <Suspense>
        <MobileBottomNav />
      </Suspense>
      <SessionPanel />
    </SessionProvider>
  );
}
