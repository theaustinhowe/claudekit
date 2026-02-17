"use client";

import { AppLayout } from "@devkit/ui/components/shared-layout";
import { insideLayoutConfig } from "./layout-config";

export function LayoutShell({ children }: { children: React.ReactNode }) {
  return <AppLayout config={insideLayoutConfig}>{children}</AppLayout>;
}
