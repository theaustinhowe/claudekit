"use client";

import type { ReactNode } from "react";
import { cn } from "../utils";

interface AppShellProps {
  sidebar?: ReactNode;
  header?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function AppShell({ sidebar, header, children, className }: AppShellProps) {
  return (
    <div className={cn("flex min-h-screen", className)}>
      {sidebar}
      <div className="flex-1 flex flex-col min-w-0">
        {header}
        <main className="flex-1 min-h-0">{children}</main>
      </div>
    </div>
  );
}
