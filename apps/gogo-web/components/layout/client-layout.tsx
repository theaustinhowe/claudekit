"use client";

import { AppShell } from "@devkit/ui";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

const AppSidebar = dynamic(() => import("./sidebar").then((m) => m.AppSidebar), { ssr: false });
const MobileBottomNav = dynamic(() => import("./sidebar").then((m) => m.MobileBottomNav), { ssr: false });
const AppHeader = dynamic(() => import("./app-shell").then((m) => m.AppHeader), { ssr: false });

// Pages that should NOT use the app shell (setup, etc.)
const excludedPaths = ["/setup"];

interface ClientLayoutProps {
  children: React.ReactNode;
}

export function ClientLayout({ children }: ClientLayoutProps) {
  const pathname = usePathname();
  const shouldUseShell = !excludedPaths.some((path) => pathname.startsWith(path));

  if (!shouldUseShell) {
    return <>{children}</>;
  }

  return (
    <>
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
    </>
  );
}
