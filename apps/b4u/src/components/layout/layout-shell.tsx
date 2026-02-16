"use client";

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
    <div className="flex h-dvh overflow-hidden">
      <AppSidebar onSelectRun={onSelectRun} onDeleteRun={onDeleteRun} onNewThread={onNewThread} />
      <div className="flex flex-col flex-1 min-w-0">
        <AppHeader />
        <main className="flex-1 overflow-hidden flex flex-col">{children}</main>
      </div>
    </div>
  );
}
