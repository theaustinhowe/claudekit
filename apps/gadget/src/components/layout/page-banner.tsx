import { cn } from "@devkit/ui";
import type { ReactNode } from "react";

interface PageBannerProps {
  title: string;
  count?: number;
  actions?: ReactNode;
  className?: string;
}

export function PageBanner({ title, count, actions, className }: PageBannerProps) {
  return (
    <div className={cn("flex h-12 shrink-0 items-center gap-2 border-b bg-background px-4", className)}>
      <h1 className="text-sm font-semibold">{title}</h1>
      {count !== undefined && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-xs font-medium text-muted-foreground">
          {count}
        </span>
      )}
      {actions && (
        <>
          <div className="flex-1" />
          <div className="flex items-center gap-2">{actions}</div>
        </>
      )}
    </div>
  );
}
