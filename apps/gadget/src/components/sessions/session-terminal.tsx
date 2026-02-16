"use client";

import { useAutoScroll } from "@devkit/hooks";
import { cn } from "@devkit/ui";
import { Badge } from "@devkit/ui/components/badge";
import { Button } from "@devkit/ui/components/button";
import { Progress } from "@devkit/ui/components/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@devkit/ui/components/tooltip";
import {
  AlertCircle,
  ArrowDown,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCopy,
  ExternalLink,
  GitBranch,
  Loader2,
  RefreshCw,
  Square,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { formatElapsed } from "@/lib/utils";

type TerminalStatus = "idle" | "connecting" | "streaming" | "done" | "error" | "reconnecting";

interface CompletionData {
  prUrl?: string;
  branchName?: string;
  diffSummary?: {
    filesChanged: number;
    insertions: number;
    deletions: number;
  };
  noChanges?: boolean;
}

interface SessionTerminalProps {
  logs: Array<{ log: string; logType: string }>;
  progress: number | null;
  phase: string | null;
  status: TerminalStatus;
  error: string | null;
  elapsed: number;
  title?: string;
  variant?: "terminal" | "compact";
  completionData?: CompletionData;
  onCancel?: () => void;
  onRetry?: () => void;
  onDismiss?: () => void;
  maxHeight?: string;
  minimized?: boolean;
  onToggleMinimize?: () => void;
}

const statusDisplay: Record<TerminalStatus, { label: string; className: string }> = {
  idle: { label: "Idle", className: "text-muted-foreground" },
  connecting: { label: "Connecting", className: "text-yellow-500" },
  streaming: { label: "Running", className: "text-emerald-500" },
  done: { label: "Complete", className: "text-emerald-500" },
  error: { label: "Error", className: "text-red-500" },
  reconnecting: { label: "Reconnecting", className: "text-amber-500" },
};

function LogLine({ log, logType }: { log: string; logType: string }) {
  const isStderr = log.startsWith("[stderr]");
  const isThinking = logType === "thinking";
  const isTool = logType === "tool";
  const isPhase = logType === "phase-separator";

  if (isPhase) {
    return (
      <div className="flex items-center gap-2 py-1.5 mt-1">
        <div className="flex-1 h-px bg-zinc-700" />
        <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider shrink-0">{log}</span>
        <div className="flex-1 h-px bg-zinc-700" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "whitespace-pre-wrap break-words text-[12px] leading-relaxed",
        isTool && "text-blue-500 font-mono",
        isThinking && "text-muted-foreground italic",
        logType === "status" && "text-foreground",
        isStderr && "text-red-500",
      )}
    >
      {log}
    </div>
  );
}

export function SessionTerminal({
  logs,
  progress,
  phase,
  status,
  error,
  elapsed,
  title,
  variant = "terminal",
  completionData,
  onCancel,
  onRetry,
  onDismiss,
  maxHeight,
  minimized,
  onToggleMinimize,
}: SessionTerminalProps) {
  const { containerRef, isAtBottom, scrollToBottom } = useAutoScroll();
  const isRunning = status === "streaming" || status === "connecting";
  const display = statusDisplay[status];
  const [copied, setCopied] = useState(false);

  const resolvedMaxHeight = maxHeight ?? (variant === "compact" ? "400px" : "100%");

  const handleCopy = useCallback(async () => {
    const text = logs.map((l) => l.log).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  }, [logs]);

  // Auto-scroll on new logs when user is near bottom
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll when logs change
  useEffect(() => {
    if (isAtBottom) {
      scrollToBottom();
    }
  }, [logs.length]);

  return (
    <div
      className="bg-zinc-950 rounded-lg border border-zinc-800 flex flex-col overflow-hidden relative"
      style={{ maxHeight: resolvedMaxHeight, height: variant === "terminal" ? "100%" : undefined }}
    >
      {/* Header */}
      <div
        className={cn("flex items-center justify-between px-4 py-2 shrink-0", !minimized && "border-b border-zinc-800")}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {title && <span className="text-xs font-medium text-zinc-400 truncate">{title}</span>}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant="outline"
                  className={cn("text-[10px] px-1.5 py-0 h-5 gap-1 shrink-0 cursor-default", display.className)}
                  aria-label={`Status: ${display.label}`}
                >
                  {isRunning && <Loader2 className="w-2.5 h-2.5 animate-spin" aria-hidden="true" />}
                  {status === "done" && <CheckCircle2 className="w-2.5 h-2.5" aria-hidden="true" />}
                  {status === "error" && <AlertCircle className="w-2.5 h-2.5" aria-hidden="true" />}
                  {isRunning && elapsed > 0 ? formatElapsed(elapsed) : display.label}
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {phase && isRunning ? phase : display.label}
                {elapsed > 0 && !isRunning ? ` (${formatElapsed(elapsed)})` : ""}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <TooltipProvider>
            {onToggleMinimize && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
                    onClick={onToggleMinimize}
                    aria-label={minimized ? "Expand" : "Collapse"}
                  >
                    {minimized ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{minimized ? "Expand" : "Collapse"}</TooltipContent>
              </Tooltip>
            )}
            {logs.length > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
                    onClick={handleCopy}
                    aria-label="Copy output"
                  >
                    {copied ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <ClipboardCopy className="w-3.5 h-3.5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Copy output</TooltipContent>
              </Tooltip>
            )}
            {isRunning && onCancel && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-red-400 hover:text-red-300 hover:bg-red-400/10"
                    onClick={onCancel}
                    aria-label="Cancel"
                  >
                    <Square className="w-3.5 h-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Cancel</TooltipContent>
              </Tooltip>
            )}
            {status === "error" && onRetry && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-blue-400 hover:text-blue-300 hover:bg-blue-400/10"
                    onClick={onRetry}
                    aria-label="Retry"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Retry</TooltipContent>
              </Tooltip>
            )}
            {(status === "done" || status === "error") && onDismiss && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-zinc-400 hover:text-zinc-300 hover:bg-zinc-400/10"
                    onClick={onDismiss}
                    aria-label="Dismiss"
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Dismiss</TooltipContent>
              </Tooltip>
            )}
          </TooltipProvider>
        </div>
      </div>

      {!minimized && (
        <>
          {/* Progress bar */}
          {progress !== null && (
            <div className="px-4 py-1.5 border-b border-zinc-800 shrink-0">
              <Progress value={progress} className="h-1.5" />
            </div>
          )}

          {/* Log output */}
          <div
            ref={containerRef}
            role="log"
            aria-live="polite"
            aria-label={title ?? "Session output"}
            className="flex-1 overflow-y-auto p-3 space-y-0 min-h-0"
          >
            {logs.map((entry, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: log entries are append-only
              <LogLine key={i} log={entry.log} logType={entry.logType} />
            ))}

            {status === "error" && error && (
              <div className="flex items-center gap-2 text-red-400 mt-3 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {status === "done" && logs.length === 0 && (
              <div className="flex items-center gap-2 text-emerald-400 text-xs">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Completed successfully</span>
              </div>
            )}
          </div>

          {/* Scroll-to-bottom indicator */}
          {!isAtBottom && isRunning && (
            <button
              type="button"
              onClick={scrollToBottom}
              className="absolute bottom-16 right-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-full px-3 py-1.5 text-xs flex items-center gap-1.5 shadow-lg border border-zinc-700 transition-colors z-10"
            >
              <ArrowDown className="w-3 h-3" />
              New output
            </button>
          )}

          {/* Completion footer with PR link and diff summary */}
          {status === "done" && completionData && !completionData.noChanges && (
            <div className="flex items-center gap-3 px-4 py-2.5 border-t border-zinc-800 shrink-0 bg-zinc-900/50">
              <div className="flex items-center gap-1.5 text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span className="text-xs font-medium">
                  {completionData.diffSummary
                    ? `${completionData.diffSummary.filesChanged} file${completionData.diffSummary.filesChanged !== 1 ? "s" : ""} changed`
                    : "Complete"}
                </span>
              </div>
              {completionData.diffSummary && (
                <span className="text-[11px] text-zinc-500">
                  <span className="text-emerald-500">+{completionData.diffSummary.insertions}</span>{" "}
                  <span className="text-red-400">-{completionData.diffSummary.deletions}</span>
                </span>
              )}
              {completionData.branchName && (
                <span className="text-[11px] text-zinc-600 flex items-center gap-1">
                  <GitBranch className="w-3 h-3" />
                  <span className="truncate max-w-[180px]">{completionData.branchName}</span>
                </span>
              )}
              <div className="ml-auto flex items-center gap-2">
                {completionData.prUrl && (
                  <a
                    href={completionData.prUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    View PR
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                {onDismiss && (
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onDismiss}>
                    Dismiss
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Footer action buttons (non-PR completion or error) */}
          {(status === "error" || (status === "done" && (!completionData || completionData.noChanges))) &&
            (onRetry || onDismiss) && (
              <div className="flex items-center gap-2 px-4 py-2 border-t border-zinc-800 shrink-0">
                {status === "done" && (
                  <div className="flex items-center gap-1.5 text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span className="text-xs font-medium">
                      {completionData?.noChanges ? "No changes needed" : "Complete"}
                    </span>
                  </div>
                )}
                {status === "error" && (
                  <div className="flex items-center gap-1.5 text-red-400">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span className="text-xs font-medium">Failed</span>
                  </div>
                )}
                <div className="ml-auto flex items-center gap-2">
                  {status === "error" && onRetry && (
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onRetry}>
                      <RefreshCw className="w-3 h-3 mr-1" />
                      Retry
                    </Button>
                  )}
                  {(status === "done" || status === "error") && onDismiss && (
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onDismiss}>
                      Dismiss
                    </Button>
                  )}
                </div>
              </div>
            )}
        </>
      )}
    </div>
  );
}
