"use client";

import type { ReactNode } from "react";
import { cn } from "../utils";

interface AppShellProps {
  sidebar?: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function AppShell({ sidebar, header, footer, children, className }: AppShellProps) {
  return (
    <div className={cn("flex flex-col h-screen", className)}>
      <div className="flex flex-1 min-h-0">
        {sidebar}
        <div className="flex-1 flex flex-col min-w-0">
          {header}
          <main className="flex-1 min-h-0 flex flex-col">{children}</main>
        </div>
      </div>
      {footer}
    </div>
  );
}
