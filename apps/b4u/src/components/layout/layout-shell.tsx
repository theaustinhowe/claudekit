"use client";

import { AppShell } from "@devkit/ui/components/app-shell";
import { AppHeader } from "./app-header";
import { AppSidebar } from "./app-sidebar";

interface LayoutShellProps {
  children: React.ReactNode;
  onSelectRun?: (runId: string) => void;
  onDeleteRun?: (runId: string) => void;
  onNewThread?: () => void;
}

export function LayoutShell({ children, onSelectRun, onDeleteRun, onNewThread }: LayoutShellProps) {
  return (
    <AppShell
      className="h-dvh overflow-hidden"
      sidebar={<AppSidebar onSelectRun={onSelectRun} onDeleteRun={onDeleteRun} onNewThread={onNewThread} />}
      header={<AppHeader />}
    >
      <div className="flex-1 overflow-hidden flex flex-col h-full">{children}</div>
    </AppShell>
  );
}
