"use client";

import { AppShell } from "@devkit/ui";
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
      <AppShell
        sidebar={
          <Suspense>
            <AppSidebar />
          </Suspense>
        }
        header={
          <Suspense>
            <AppHeader />
          </Suspense>
        }
      >
        <div className="pb-16 md:pb-0 h-full">{children}</div>
      </AppShell>
      <Suspense>
        <MobileBottomNav />
      </Suspense>
      <SessionPanel />
    </SessionProvider>
  );
}
