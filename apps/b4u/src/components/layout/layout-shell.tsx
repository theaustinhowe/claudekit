"use client";

import { AppLayout } from "@devkit/ui/components/shared-layout";
import { useMemo } from "react";
import { PhaseStepper } from "./app-header";
import { SessionList } from "./app-sidebar";
import { b4uLayoutConfig } from "./layout-config";

interface LayoutShellProps {
  children: React.ReactNode;
  onSelectRun?: (runId: string) => void;
  onDeleteRun?: (runId: string) => void;
  onNewThread?: () => void;
}

export function LayoutShell({ children, onSelectRun, onDeleteRun, onNewThread }: LayoutShellProps) {
  const SidebarContent = useMemo(
    () =>
      function B4USidebar({ collapsed }: { collapsed: boolean }) {
        return (
          <SessionList
            collapsed={collapsed}
            onSelectRun={onSelectRun}
            onDeleteRun={onDeleteRun}
            onNewThread={onNewThread}
          />
        );
      },
    [onSelectRun, onDeleteRun, onNewThread],
  );

  return (
    <AppLayout config={b4uLayoutConfig} sidebarContent={SidebarContent} contentBanner={<PhaseStepper />}>
      {children}
    </AppLayout>
  );
}
