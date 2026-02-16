"use client";

import { AppLayout } from "@devkit/ui/components/shared-layout";
import { SessionProvider } from "@/components/sessions/session-context";
import { SessionIndicator } from "@/components/sessions/session-indicator";
import { SessionPanel } from "@/components/sessions/session-panel";
import { gadgetLayoutConfig } from "./layout-config";

export function LayoutShell({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <AppLayout config={gadgetLayoutConfig} statusIndicator={<SessionIndicator />}>
        {children}
      </AppLayout>
      <SessionPanel />
    </SessionProvider>
  );
}
