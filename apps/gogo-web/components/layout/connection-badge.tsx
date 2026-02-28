"use client";

import { cn } from "@claudekit/ui";
import { Badge } from "@claudekit/ui/components/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@claudekit/ui/components/popover";
import { Heart } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useWebSocketContext } from "@/contexts/websocket-context";
import { useHealth } from "@/hooks/use-jobs";

export function ConnectionBadge() {
  const { connectionState } = useWebSocketContext();
  const { data: health } = useHealth();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const isDbOk = health?.database?.connected ?? false;
  const isPollingOk = health?.polling?.active ?? false;
  const isRateLimitOk = !health?.github?.rateLimitCritical;
  const isHealthy = isDbOk && isPollingOk && isRateLimitOk;

  const statusText = isHealthy
    ? "All systems operational"
    : !isDbOk
      ? "Database disconnected"
      : !isPollingOk
        ? "GitHub polling paused"
        : "Rate limit critical";

  if (!mounted) {
    return (
      <Badge variant="secondary" className="gap-1.5 text-xs">
        <span className="h-2 w-2 rounded-full bg-muted-foreground" />
        Offline
      </Badge>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="cursor-pointer">
          <Badge
            variant={
              connectionState === "connected"
                ? "default"
                : connectionState === "reconnecting"
                  ? "secondary"
                  : "destructive"
            }
            className="gap-1.5 text-xs"
          >
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                connectionState === "connected"
                  ? "bg-green-500"
                  : connectionState === "reconnecting"
                    ? "animate-pulse bg-yellow-500"
                    : "bg-red-500",
              )}
            />
            {connectionState === "connected" ? "Live" : connectionState === "reconnecting" ? "Reconnecting" : "Offline"}
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-3">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className={cn("h-2.5 w-2.5 rounded-full", isHealthy ? "bg-green-500" : "bg-red-500")} />
            <span className="text-sm font-medium">{statusText}</span>
          </div>
          <div className="border-t" />
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">WebSocket</span>
              <span className={connectionState === "connected" ? "text-green-500" : "text-red-500"}>
                {connectionState === "connected" ? "connected" : connectionState}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Database</span>
              <span className={isDbOk ? "text-green-500" : "text-red-500"}>
                {isDbOk ? "connected" : "disconnected"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Polling</span>
              <span className={isPollingOk ? "text-green-500" : "text-yellow-500"}>
                {isPollingOk ? "active" : "paused"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Rate limit</span>
              <span className={isRateLimitOk ? "text-green-500" : "text-red-500"}>
                {isRateLimitOk ? "OK" : "critical"}
              </span>
            </div>
          </div>
          <div className="border-t" />
          <Link
            href="/health"
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Heart className={cn("h-3.5 w-3.5", isHealthy ? "text-green-500" : "text-red-500")} />
            <span>Health dashboard</span>
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
