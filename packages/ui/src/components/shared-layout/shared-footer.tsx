"use client";

import { Clapperboard, LayoutDashboard, Search, Swords } from "lucide-react";
import { cn } from "../../utils";
import type { DevkitAppLink } from "./types";

const DEFAULT_APPS: DevkitAppLink[] = [
  { label: "Dashboard", port: 2000, icon: LayoutDashboard },
  { label: "Gadget", port: 2100, icon: Search },
  { label: "GoGo", port: 2200, icon: Swords },
  { label: "B4U", port: 2300, icon: Clapperboard },
];

export function SharedFooter({ currentPort }: { currentPort: number }) {
  return (
    <footer className="border-t border-border bg-muted/30 py-2 px-4">
      <nav className="flex items-center gap-1 flex-wrap">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mr-1">Apps</span>
        {DEFAULT_APPS.map((app) => {
          const isCurrent = app.port === currentPort;
          return (
            <a
              key={app.port}
              href={`http://localhost:${app.port}`}
              className={cn(
                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-colors",
                isCurrent
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted",
              )}
            >
              <app.icon className="w-3.5 h-3.5" />
              <span>{app.label}</span>
            </a>
          );
        })}
      </nav>
    </footer>
  );
}
