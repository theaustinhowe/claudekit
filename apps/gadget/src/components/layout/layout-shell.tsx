"use client";

import { AppLayout } from "@devkit/ui/components/shared-layout";
import { GadgetSessionProvider } from "@/components/sessions/session-context";
import { SessionIndicator } from "@/components/sessions/session-indicator";
import { SessionPanel } from "@/components/sessions/session-panel";
import { gadgetLayoutConfig } from "./layout-config";

export function LayoutShell({ children }: { children: React.ReactNode }) {
  return (
    <GadgetSessionProvider>
      <AppLayout config={gadgetLayoutConfig} statusIndicator={<SessionIndicator />}>
        {children}
      </AppLayout>
      <SessionPanel />
    </GadgetSessionProvider>
  );
}
