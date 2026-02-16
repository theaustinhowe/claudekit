"use client";

import { cn } from "@devkit/ui";
import type { ReactNode } from "react";

export interface Tab {
  id: string;
  label: string;
  count?: number;
}

interface PageTabsProps<T extends string = string> {
  tabs: Tab[];
  value: T;
  onValueChange: (value: T) => void;
  className?: string;
  actions?: ReactNode;
}

export function PageTabs<T extends string = string>({
  tabs,
  value,
  onValueChange,
  className,
  actions,
}: PageTabsProps<T>) {
  return (
    <div className={cn("flex h-12 shrink-0 items-center gap-1 border-b bg-background px-4", className)}>
      <div className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden">
        {tabs.map((tab) => {
          const isActive = tab.id === value;

          return (
            <button
              type="button"
              key={tab.id}
              onClick={() => onValueChange(tab.id as T)}
              className={cn(
                "relative flex items-center gap-2 whitespace-nowrap px-4 py-2 text-sm font-medium transition-colors",
                isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span
                  className={cn(
                    "flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-medium",
                    isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                  )}
                >
                  {tab.count}
                </span>
              )}
              {isActive && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
            </button>
          );
        })}
      </div>
      {actions && (
        <>
          <div className="flex-1" />
          <div className="flex items-center gap-2">{actions}</div>
        </>
      )}
    </div>
  );
}
