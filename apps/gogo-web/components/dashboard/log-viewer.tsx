"use client";

import type { JobLog, LogStream } from "@devkit/gogo-shared";
import { format } from "date-fns";
import { AlertCircle, ArrowDown, Info, Loader2, Terminal } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@devkit/ui/components/button";
import { ScrollArea } from "@devkit/ui/components/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@devkit/ui/components/tabs";
import { useWebSocketContext } from "@/contexts/websocket-context";
import { useJobLogs } from "@/hooks/use-jobs";
import { cn } from "@devkit/ui";

interface LogViewerProps {
  jobId: string;
  className?: string;
  /** When true, auto-scroll is enabled by default */
  isActive?: boolean;
}

type StreamFilter = "all" | "stdout" | "stderr" | "system";

const STREAM_CONFIG: Record<LogStream, { icon: typeof Terminal; color: string; label: string; className?: string }> = {
  stdout: {
    icon: Terminal,
    color: "text-foreground",
    label: "stdout",
  },
  "stdout:content": {
    icon: Terminal,
    color: "text-foreground",
    label: "stdout",
  },
  "stdout:tool": {
    icon: Terminal,
    color: "text-blue-500 dark:text-blue-400",
    label: "tool",
    className: "font-medium",
  },
  "stdout:thinking": {
    icon: Terminal,
    color: "text-muted-foreground italic",
    label: "thinking",
  },
  stderr: {
    icon: AlertCircle,
    color: "text-red-500 dark:text-red-400",
    label: "stderr",
  },
  system: {
    icon: Info,
    color: "text-blue-500 dark:text-blue-400",
    label: "system",
  },
};

export function LogViewer({ jobId, className, isActive: _isActive = false }: LogViewerProps) {
  const { data: logs = [], isLoading } = useJobLogs(jobId);
  const { subscribeToJob, unsubscribeFromJob } = useWebSocketContext();
  const [filter, setFilter] = useState<StreamFilter>("all");
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Subscribe to job logs via WebSocket
  useEffect(() => {
    subscribeToJob(jobId);
    return () => unsubscribeFromJob(jobId);
  }, [jobId, subscribeToJob, unsubscribeFromJob]);

  // Scroll to bottom helper that works with ScrollArea viewport
  const doScrollToBottom = useCallback((smooth = true) => {
    const viewport = scrollViewportRef.current;
    if (viewport) {
      viewport.scrollTo({
        top: viewport.scrollHeight,
        behavior: smooth ? "smooth" : "instant",
      });
    }
  }, []);

  // Auto-scroll to bottom when new logs arrive
  // biome-ignore lint/correctness/useExhaustiveDependencies: logs.length triggers scroll on new logs
  useEffect(() => {
    if (autoScroll) {
      doScrollToBottom();
    }
  }, [logs.length, autoScroll, doScrollToBottom]);

  // Scroll to bottom on initial load
  // biome-ignore lint/correctness/useExhaustiveDependencies: only run once when logs first load
  useEffect(() => {
    if (logs.length > 0) {
      requestAnimationFrame(() => {
        doScrollToBottom(false);
      });
    }
  }, [logs.length > 0]);

  // Detect when user scrolls away from bottom
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const { scrollTop, scrollHeight, clientHeight } = container;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setAutoScroll(isAtBottom);
  }, []);

  const scrollToBottom = useCallback(() => {
    doScrollToBottom();
    setAutoScroll(true);
  }, [doScrollToBottom]);

  const filteredLogs =
    filter === "all"
      ? logs
      : filter === "stdout"
        ? logs.filter((log) => log.stream.startsWith("stdout"))
        : logs.filter((log) => log.stream === filter);

  const streamCounts = {
    all: logs.length,
    stdout: logs.filter((l) => l.stream.startsWith("stdout")).length,
    stderr: logs.filter((l) => l.stream === "stderr").length,
    system: logs.filter((l) => l.stream === "system").length,
  };

  if (isLoading) {
    return (
      <div className={cn("flex flex-col h-full", className)}>
        <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading logs...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Filter Bar */}
      <div className="flex items-center justify-between gap-3 mb-3">
        {/* Filter Tabs */}
        <Tabs value={filter} onValueChange={(v) => setFilter(v as StreamFilter)}>
          <TabsList className="h-8">
            <TabsTrigger value="all" className="text-xs px-2">
              All ({streamCounts.all})
            </TabsTrigger>
            <TabsTrigger value="stdout" className="text-xs px-2">
              stdout ({streamCounts.stdout})
            </TabsTrigger>
            <TabsTrigger value="stderr" className="text-xs px-2">
              stderr ({streamCounts.stderr})
            </TabsTrigger>
            <TabsTrigger value="system" className="text-xs px-2">
              system ({streamCounts.system})
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Error count on the right */}
        {streamCounts.stderr > 0 && (
          <span className="text-xs text-red-500 dark:text-red-400 flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            {streamCounts.stderr} {streamCounts.stderr === 1 ? "error" : "errors"}
          </span>
        )}
      </div>

      {/* Log Content */}
      <div className="relative flex-1 min-h-0">
        <ScrollArea
          className="h-full rounded-lg border bg-muted/30"
          viewportRef={scrollViewportRef}
          onViewportScroll={handleScroll}
        >
          <div className="p-3 font-mono text-xs space-y-1">
            {filteredLogs.length === 0 ? (
              <p className="text-muted-foreground italic">
                {filter !== "all"
                  ? `No ${filter} output recorded yet.`
                  : "Waiting for agent output\u2026 Logs will appear here once the agent starts running."}
              </p>
            ) : (
              filteredLogs.map((log, index) => <LogEntry key={log.id || `log-${index}`} log={log} />)
            )}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>

        {/* Jump to bottom indicator */}
        {!autoScroll && logs.length > 0 && (
          <Button
            variant="secondary"
            size="sm"
            className="absolute bottom-4 right-4 gap-1 shadow-md"
            onClick={scrollToBottom}
          >
            <ArrowDown className="h-3 w-3" />
            Jump to latest
          </Button>
        )}
      </div>
    </div>
  );
}

function LogEntry({ log }: { log: JobLog }) {
  const config = STREAM_CONFIG[log.stream] || STREAM_CONFIG.stdout;
  const Icon = config.icon;

  const timestamp = log.createdAt ? new Date(log.createdAt) : null;
  const isValidTimestamp = timestamp && !Number.isNaN(timestamp.getTime());

  return (
    <div className="flex items-start gap-2 group">
      <span className="text-muted-foreground shrink-0 tabular-nums">
        {isValidTimestamp ? format(timestamp, "HH:mm:ss.SSS") : "--:--:--.---"}
      </span>
      <Icon className={cn("h-3.5 w-3.5 mt-0.5 shrink-0", config.color)} />
      <span className={cn("break-all whitespace-pre-wrap", config.color, config.className)}>{log.content}</span>
    </div>
  );
}
