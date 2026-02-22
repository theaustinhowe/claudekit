"use client";

import { SessionIndicator } from "@claudekit/ui/components/session-indicator";
import { SessionPanel } from "@claudekit/ui/components/session-panel";
import { SessionProvider } from "@claudekit/ui/components/session-provider";
import { AppLayout } from "@claudekit/ui/components/shared-layout";
import { useMemo } from "react";
import { b4uSessionConfig } from "@/lib/session-config";
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
    <SessionProvider config={b4uSessionConfig}>
      <AppLayout
        config={b4uLayoutConfig}
        sidebarContent={SidebarContent}
        contentBanner={<PhaseStepper />}
        statusIndicator={<SessionIndicator />}
      >
        {children}
      </AppLayout>
      <SessionPanel />
    </SessionProvider>
  );
}
