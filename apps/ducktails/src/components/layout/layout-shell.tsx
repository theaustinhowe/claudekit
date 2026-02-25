"use client";

import { AppLayout } from "@claudekit/ui/components/shared-layout";
import { ducktailsLayoutConfig } from "./layout-config";

export function LayoutShell({ children }: { children: React.ReactNode }) {
  return <AppLayout config={ducktailsLayoutConfig}>{children}</AppLayout>;
}
