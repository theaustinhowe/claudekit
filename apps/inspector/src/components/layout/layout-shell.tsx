"use client";

import { AppLayout } from "@claudekit/ui/components/shared-layout";
import { inspectorLayoutConfig } from "./layout-config";

export function LayoutShell({ children }: { children: React.ReactNode }) {
  return <AppLayout config={inspectorLayoutConfig}>{children}</AppLayout>;
}
