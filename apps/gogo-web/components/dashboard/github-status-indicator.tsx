"use client";

import { AlertTriangle, Clock, Coffee, Github, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@devkit/ui/components/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@devkit/ui/components/tooltip";
import { useHealth } from "@/hooks/use-jobs";
import { cn } from "@devkit/ui";

interface GitHubStatusIndicatorProps {
  compact?: boolean;
  className?: string;
}

/**
 * A playful indicator for GitHub API status:
 * - Shows rate limit warnings with countdown to reset
 * - Shows unreachable/throttled state with fun messaging
 * - Animates during countdown
 */
export function GitHubStatusIndicator({ compact = false, className }: GitHubStatusIndicatorProps) {
  const { data: health, isError } = useHealth();
  const [countdown, setCountdown] = useState<string | null>(null);

  const polling = health?.polling;
  const github = health?.github;

  // Calculate countdown to reset
  useEffect(() => {
    if (!polling?.throttleResetAt && !github?.lowestRateLimit?.resetsAt) {
      setCountdown(null);
      return;
    }

    const resetAt = polling?.throttleResetAt || github?.lowestRateLimit?.resetsAt;
    if (!resetAt) return;

    const updateCountdown = () => {
      const resetTime = new Date(resetAt).getTime();
      const now = Date.now();
      const diff = resetTime - now;

      if (diff <= 0) {
        setCountdown(null);
        return;
      }

      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);

      if (minutes > 0) {
        setCountdown(`${minutes}m ${seconds}s`);
      } else {
        setCountdown(`${seconds}s`);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [polling?.throttleResetAt, github?.lowestRateLimit?.resetsAt]);

  // Determine status
  const isThrottled = polling?.throttled;
  const isRateLimitCritical = github?.rateLimitCritical;
  const isRateLimitWarning = github?.rateLimitWarning;
  const isUnreachable = isError || !health;

  // Playful messages based on state
  const getStatusMessage = () => {
    if (isUnreachable) {
      return "GitHub is taking a break";
    }
    if (isThrottled && polling?.throttleReason === "rate_limit") {
      return "Rate limit reached - time for coffee";
    }
    if (isThrottled) {
      return polling?.throttleReason || "Throttled";
    }
    if (isRateLimitCritical) {
      return "Rate limit critical";
    }
    if (isRateLimitWarning) {
      return "Rate limit getting low";
    }
    return "GitHub connected";
  };

  const getIcon = () => {
    if (isUnreachable || isThrottled || isRateLimitCritical) {
      return <Coffee className="h-4 w-4" />;
    }
    if (isRateLimitWarning) {
      return <AlertTriangle className="h-4 w-4" />;
    }
    return <Github className="h-4 w-4" />;
  };

  const getStatusColor = () => {
    if (isUnreachable || isThrottled || isRateLimitCritical) {
      return "text-orange-500";
    }
    if (isRateLimitWarning) {
      return "text-yellow-500";
    }
    return "text-green-500";
  };

  const getBadgeVariant = (): "default" | "secondary" | "destructive" | "outline" => {
    if (isUnreachable || isThrottled || isRateLimitCritical) {
      return "destructive";
    }
    if (isRateLimitWarning) {
      return "secondary";
    }
    return "default";
  };

  // Compact mode for sidebar/header
  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn("flex items-center gap-1.5 cursor-default", className)}>
              <span className={cn(getStatusColor(), countdown && "animate-pulse")}>{getIcon()}</span>
              {countdown && <span className="text-xs text-muted-foreground font-mono">{countdown}</span>}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p className="font-medium">{getStatusMessage()}</p>
            {countdown && <p className="text-xs text-muted-foreground">Resets in {countdown}</p>}
            {github?.lowestRateLimit && (
              <p className="text-xs text-muted-foreground">
                {github.lowestRateLimit.remaining}/{github.lowestRateLimit.limit} remaining
              </p>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Full display mode
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border p-3",
        isThrottled || isRateLimitCritical
          ? "border-orange-500/50 bg-orange-500/10"
          : isRateLimitWarning
            ? "border-yellow-500/50 bg-yellow-500/10"
            : "border-border bg-muted/30",
        className,
      )}
    >
      <div className={cn("flex items-center gap-2", getStatusColor())}>
        <span className={countdown ? "animate-pulse" : ""}>{getIcon()}</span>
        <span className="font-medium">{getStatusMessage()}</span>
      </div>

      {countdown && (
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          <span className="font-mono text-sm">{countdown}</span>
        </div>
      )}

      {github?.lowestRateLimit && !isUnreachable && (
        <Badge variant={getBadgeVariant()} className="ml-auto">
          {github.lowestRateLimit.remaining}/{github.lowestRateLimit.limit}
        </Badge>
      )}

      {polling?.active && !isThrottled && !isUnreachable && <Zap className="h-4 w-4 text-green-500 ml-auto" />}
    </div>
  );
}
