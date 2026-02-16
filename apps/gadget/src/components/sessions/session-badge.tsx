"use client";

import { Badge } from "@devkit/ui/components/badge";
import { Check, Clock, Loader2, X } from "lucide-react";
import type { SessionStatus } from "@/lib/types";
import { cn, formatElapsed } from "@/lib/utils";

interface SessionBadgeProps {
  status: SessionStatus;
  label?: string;
  elapsed?: number;
}

const statusConfig: Record<SessionStatus, { icon: typeof Check; className: string; text: string }> = {
  pending: { icon: Clock, className: "text-muted-foreground", text: "Pending" },
  running: { icon: Loader2, className: "text-emerald-500", text: "Running" },
  done: { icon: Check, className: "text-emerald-500", text: "Done" },
  error: { icon: X, className: "text-red-500", text: "Error" },
  cancelled: { icon: X, className: "text-muted-foreground", text: "Cancelled" },
};

export function SessionBadge({ status, label, elapsed }: SessionBadgeProps) {
  const config = statusConfig[status];
  const Icon = config.icon;
  const isRunning = status === "running";

  return (
    <Badge variant="outline" className={cn("gap-1 text-[11px] px-1.5 py-0 h-5", config.className)}>
      {isRunning ? (
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
      ) : (
        <Icon className={cn("w-3 h-3", status === "pending" && "animate-spin")} />
      )}
      {label ?? config.text}
      {elapsed !== undefined && elapsed > 0 && (
        <span className="text-muted-foreground ml-0.5">{formatElapsed(elapsed)}</span>
      )}
    </Badge>
  );
}
