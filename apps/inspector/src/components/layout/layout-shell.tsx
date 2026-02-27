"use client";

import { AppLayout } from "@claudekit/ui/components/shared-layout";
import { InspectorSessionProvider } from "@/components/sessions/session-context";
import { SessionIndicator } from "@/components/sessions/session-indicator";
import { SessionPanel } from "@/components/sessions/session-panel";
import { inspectorLayoutConfig } from "./layout-config";

export function LayoutShell({ children }: { children: React.ReactNode }) {
  return (
    <InspectorSessionProvider>
      <AppLayout config={inspectorLayoutConfig} statusIndicator={<SessionIndicator />}>
        <div className="max-w-5xl mx-auto w-full p-6 space-y-6">{children}</div>
      </AppLayout>
      <SessionPanel />
    </InspectorSessionProvider>
  );
}
