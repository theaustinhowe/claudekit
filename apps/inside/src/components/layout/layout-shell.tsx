"use client";

import { AppLayout } from "@claudekit/ui/components/shared-layout";
import { InsideSessionProvider } from "@/components/sessions/session-context";
import { SessionIndicator } from "@/components/sessions/session-indicator";
import { SessionPanel } from "@/components/sessions/session-panel";
import { insideLayoutConfig } from "./layout-config";

export function LayoutShell({ children }: { children: React.ReactNode }) {
  return (
    <InsideSessionProvider>
      <AppLayout config={insideLayoutConfig} statusIndicator={<SessionIndicator />}>
        {children}
      </AppLayout>
      <SessionPanel />
    </InsideSessionProvider>
  );
}
