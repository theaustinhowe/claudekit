"use client";

import type { SessionStreamEvent } from "@devkit/hooks";
import { useAutoScroll, useSessionStream } from "@devkit/hooks";
import { Badge } from "@devkit/ui/components/badge";
import { Button } from "@devkit/ui/components/button";
import { Switch } from "@devkit/ui/components/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@devkit/ui/components/tooltip";
import { ArrowDown, CheckCircle2, Loader2, Pause, ShieldAlert, Sparkles, X, Zap } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AutoFixStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

interface AutoFixIndicatorProps {
  projectId: string;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
}

const statusConfig: Record<AutoFixStatus, { label: string; icon: typeof Zap; className: string }> = {
  idle: { label: "Watching", icon: Zap, className: "text-muted-foreground" },
  detecting: { label: "Error detected", icon: ShieldAlert, className: "text-yellow-500" },
  fixing: { label: "Fixing...", icon: Loader2, className: "text-blue-500" },
  success: { label: "Fixed!", icon: CheckCircle2, className: "text-green-500" },
  failed: { label: "Failed", icon: ShieldAlert, className: "text-red-500" },
  cooldown: { label: "Paused", icon: Pause, className: "text-orange-500" },
  cancelled: { label: "Cancelled", icon: X, className: "text-muted-foreground" },
};

export function AutoFixIndicator({ projectId, enabled, onToggle }: AutoFixIndicatorProps) {
  const [autoFixStatus, setAutoFixStatus] = useState<AutoFixStatus>("idle");
  const [logs, setLogs] = useState<Array<{ log: string; logType: string }>>([]);
  const [expanded, setExpanded] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const { containerRef, isAtBottom, scrollToBottom } = useAutoScroll();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleEvent = useCallback((event: SessionStreamEvent) => {
    // Map session events to auto-fix status
    const status = event.data?.status as AutoFixStatus | undefined;
    if (status) setAutoFixStatus(status);
    if (event.message) setMessage(event.message);

    if (event.log) {
      setLogs((prev) => [...prev.slice(-100), { log: event.log as string, logType: event.logType ?? "status" }]);
    }

    if (event.data?.type === "started") {
      setLogs([]);
      setExpanded(true);
    }

    const eventType = event.data?.type as string | undefined;
    if (eventType === "success" || eventType === "failed" || eventType === "cancelled") {
      setTimeout(() => setExpanded(false), 8_000);
    }
  }, []);

  const handleComplete = useCallback(() => {
    // Session ended, reset polling to find next session
    setSessionId(null);
  }, []);

  const { disconnect } = useSessionStream({
    sessionId,
    autoConnect: true,
    onEvent: handleEvent,
    onComplete: handleComplete,
  });

  // Poll for active auto-fix sessions
  useEffect(() => {
    if (!enabled) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      disconnect();
      setSessionId(null);
      setAutoFixStatus("idle");
      setLogs([]);
      return;
    }

    const poll = async () => {
      if (sessionId) return; // Already connected to a session
      try {
        const res = await fetch(`/api/sessions?type=auto_fix&contextId=${projectId}&status=pending,running&limit=1`);
        if (res.ok) {
          const sessions = await res.json();
          if (sessions.length > 0) {
            setSessionId(sessions[0].id);
          }
        }
      } catch {
        // Ignore poll errors
      }
    };

    poll();
    pollRef.current = setInterval(poll, 5000);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [projectId, enabled, sessionId, disconnect]);

  // Auto-scroll logs when user is near bottom
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll when logs change
  useEffect(() => {
    if (isAtBottom) {
      scrollToBottom();
    }
  }, [logs.length]);

  const handleCancel = useCallback(async () => {
    try {
      await fetch(`/api/projects/${projectId}/auto-fix`, { method: "DELETE" });
    } catch {
      // ignore
    }
  }, [projectId]);

  const config = statusConfig[autoFixStatus];
  const Icon = config.icon;
  const isFixing = autoFixStatus === "fixing";

  if (!enabled) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5">
              <Switch checked={false} onCheckedChange={onToggle} className="scale-75" />
              <Sparkles className="w-3 h-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">Auto-fix</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>Enable auto-fix to automatically fix dev server errors with Claude</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Header row */}
      <div className="flex items-center gap-1.5">
        <Switch checked={true} onCheckedChange={onToggle} className="scale-75" />
        <Sparkles className="w-3 h-3 text-primary" />
        <span className="text-[10px] font-medium text-primary">Auto-fix</span>
        <Badge
          variant="outline"
          className={cn("text-[9px] px-1.5 py-0 h-4 gap-1 cursor-pointer", config.className)}
          onClick={() => setExpanded((e) => !e)}
        >
          <Icon className={cn("w-2.5 h-2.5", isFixing && "animate-spin")} />
          {config.label}
        </Badge>
        {isFixing && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-4 w-4 text-muted-foreground" onClick={handleCancel}>
                  <X className="w-2.5 h-2.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Cancel</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      {/* Expandable log area */}
      {expanded && logs.length > 0 && (
        <div className="relative mt-1.5">
          <div
            ref={containerRef}
            role="log"
            aria-live="polite"
            aria-label="Auto-fix output"
            className="max-h-32 overflow-y-auto rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 font-mono text-[10px] leading-relaxed"
          >
            {message && <div className="text-muted-foreground mb-1">{message}</div>}
            {logs.map((entry, i) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: log entries are append-only
                key={i}
                className={cn(
                  "whitespace-pre-wrap break-all",
                  entry.logType === "tool" && "text-blue-500 font-mono",
                  entry.logType === "thinking" && "text-muted-foreground italic",
                  entry.logType === "status" && "text-foreground",
                )}
              >
                {entry.log}
              </div>
            ))}
          </div>
          {!isAtBottom && isFixing && (
            <button
              type="button"
              onClick={scrollToBottom}
              className="absolute bottom-1 right-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-full px-2 py-0.5 text-[10px] flex items-center gap-1 shadow-lg border border-zinc-700 transition-colors z-10"
            >
              <ArrowDown className="w-2.5 h-2.5" />
              New output
            </button>
          )}
        </div>
      )}
    </div>
  );
}
