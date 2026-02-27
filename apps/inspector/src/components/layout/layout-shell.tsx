"use client";

import { AppLayout } from "@claudekit/ui/components/shared-layout";
import { inspectorLayoutConfig } from "./layout-config";

export function LayoutShell({ children }: { children: React.ReactNode }) {
  return (
    <AppLayout config={inspectorLayoutConfig}>
      <div className="max-w-5xl mx-auto w-full p-6 space-y-6">{children}</div>
    </AppLayout>
  );
}
