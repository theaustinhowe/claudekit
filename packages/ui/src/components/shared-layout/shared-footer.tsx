"use client";

import { Clapperboard, Compass, Eye, LayoutDashboard, Search, Swords } from "lucide-react";
import { Fragment } from "react";
import { cn } from "../../utils";
import type { ClaudeKitAppLink } from "./types";

const DEFAULT_APPS: ClaudeKitAppLink[] = [
  { label: "Dashboard", port: 2000, icon: LayoutDashboard },
  { label: "Gadget", port: 2100, icon: Search },
  { label: "Inside", port: 2150, icon: Compass },
  { label: "GoGo", port: 2200, icon: Swords },
  { label: "B4U", port: 2300, icon: Clapperboard },
  { label: "Inspector", port: 2400, icon: Eye },
];

export function SharedFooter({ currentPort }: { currentPort: number }) {
  return (
    <footer className="hidden md:flex items-center justify-center border-t border-border bg-muted/20 shrink-0 py-1.5 px-4">
      <nav className="flex items-center gap-0.5">
        {DEFAULT_APPS.map((app, i) => {
          const isCurrent = app.port === currentPort;
          return (
            <Fragment key={app.port}>
              {i > 0 && (
                <span className="text-border text-[10px] mx-1" aria-hidden="true">
                  &middot;
                </span>
              )}
              <a
                href={`http://localhost:${app.port}`}
                className={cn(
                  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-colors",
                  isCurrent
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                )}
              >
                <app.icon className="w-3.5 h-3.5" />
                <span>{app.label}</span>
              </a>
            </Fragment>
          );
        })}
      </nav>
    </footer>
  );
}
