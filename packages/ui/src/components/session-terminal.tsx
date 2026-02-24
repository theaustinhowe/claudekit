"use client";

import { useAutoScroll } from "@claudekit/hooks";
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
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { cn, formatElapsed } from "../utils";
import { Badge } from "./badge";
import { Button } from "./button";
import { Progress } from "./progress";
import { parseStreamLog, resetStreamIdCounter, type StreamEntry, StreamingDisplay } from "./streaming-display";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type TerminalStatus = "idle" | "connecting" | "streaming" | "done" | "error" | "cancelled" | "reconnecting";

export interface LogEntry {
  log: string;
  logType: string;
}

export interface CompletionData {
  prUrl?: string;
  branchName?: string;
  diffSummary?: {
    filesChanged: number;
    insertions: number;
    deletions: number;
  };
  noChanges?: boolean;
}

export interface SessionTerminalProps {
  logs: LogEntry[];
  progress: number | null;
  phase: string | null;
  status: TerminalStatus;
  error: string | null;
  elapsed: number;
  title?: string;
  variant?: "terminal" | "compact" | "card";
  maxHeight?: string;
  minimized?: boolean;
  onToggleMinimize?: () => void;
  clickableHeader?: boolean;
  onCancel?: () => void;
  onRetry?: () => void;
  onDismiss?: () => void;
  completionData?: CompletionData;
  copyFeedback?: "toast" | "inline";
  headerExtra?: ReactNode;
  "aria-label"?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const statusDisplay: Record<TerminalStatus, { label: string; className: string }> = {
  idle: { label: "Idle", className: "text-muted-foreground" },
  connecting: { label: "Connecting", className: "text-warning" },
  streaming: { label: "Running", className: "text-success" },
  done: { label: "Complete", className: "text-success" },
  error: { label: "Error", className: "text-destructive" },
  cancelled: { label: "Cancelled", className: "text-destructive" },
  reconnecting: { label: "Reconnecting", className: "text-warning" },
};

function isRunningStatus(status: TerminalStatus): boolean {
  return status === "streaming" || status === "connecting";
}

function isCardVariant(variant: string): boolean {
  return variant === "card";
}

// ---------------------------------------------------------------------------
// TerminalHeader
// ---------------------------------------------------------------------------

interface TerminalHeaderProps {
  status: TerminalStatus;
  title?: string;
  phase: string | null;
  elapsed: number;
  progress: number | null;
  variant: "terminal" | "compact" | "card";
  minimized?: boolean;
  copied: boolean;
  logsCount: number;
  isRunning: boolean;
  clickableHeader: boolean;
  headerExtra?: ReactNode;
  onToggleMinimize?: () => void;
  onCopy: () => void;
  onCancel?: () => void;
  onRetry?: () => void;
  onDismiss?: () => void;
}

function CardStatusIndicator({ status }: { status: TerminalStatus }) {
  if (status === "done") {
    return (
      <span className="text-success" style={{ fontSize: 14, lineHeight: 1 }}>
        &#10003;
      </span>
    );
  }
  if (status === "error" || status === "cancelled") {
    return (
      <span className="text-destructive" style={{ fontSize: 14, lineHeight: 1 }}>
        &#10007;
      </span>
    );
  }
  return <div className="animate-pulse bg-primary opacity-70 shrink-0 rounded-full" style={{ width: 8, height: 8 }} />;
}

function TerminalHeader({
  status,
  title,
  phase,
  elapsed,
  progress,
  variant,
  minimized,
  copied,
  logsCount,
  isRunning,
  clickableHeader,
  headerExtra,
  onToggleMinimize,
  onCopy,
  onCancel,
  onRetry,
  onDismiss,
}: TerminalHeaderProps) {
  const display = statusDisplay[status];
  const card = isCardVariant(variant);

  // Card variant: clickable header
  if (card) {
    const headerContent = (
      <>
        <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
          <CardStatusIndicator status={status} />
          <span className="text-xs truncate text-muted-foreground">{phase ?? title ?? "Session"}</span>
          {elapsed > 0 && <span className="text-xs text-muted-foreground shrink-0">{formatElapsed(elapsed)}</span>}
        </div>

        {/* biome-ignore lint/a11y/noStaticElementInteractions: wrapper stops propagation to parent button-like div */}
        <div
          className="flex items-center gap-1"
          role="presentation"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {progress !== null && progress > 0 && isRunning && (
            <span className="text-xs font-medium text-primary mr-1">{Math.round(progress)}%</span>
          )}

          {logsCount > 0 && (
            <button
              type="button"
              onClick={onCopy}
              className={cn(
                "text-xs px-1.5 py-0.5 bg-transparent border-none cursor-pointer rounded-sm",
                copied ? "text-success" : "text-muted-foreground",
              )}
              title="Copy logs"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          )}

          {isRunning && onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="text-xs px-1.5 py-0.5 text-destructive bg-transparent border-none cursor-pointer rounded-sm"
              title="Cancel session"
            >
              Cancel
            </button>
          )}

          {(status === "error" || status === "cancelled") && onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="text-xs px-1.5 py-0.5 text-primary bg-transparent border-none cursor-pointer rounded-sm"
              title="Retry"
            >
              Retry
            </button>
          )}

          {headerExtra}

          {onToggleMinimize && (
            <button
              type="button"
              onClick={onToggleMinimize}
              className="text-xs px-1 py-0.5 text-muted-foreground bg-transparent border-none cursor-pointer rounded-sm"
              style={{ fontSize: 16, lineHeight: 1 }}
              title={minimized ? "Expand" : "Collapse"}
            >
              {minimized ? "\u25B8" : "\u25BE"}
            </button>
          )}
        </div>
      </>
    );

    if (clickableHeader && onToggleMinimize) {
      return (
        /* biome-ignore lint/a11y/useSemanticElements: header contains nested interactive buttons, cannot be a single button */
        <div
          className="flex items-center justify-between"
          style={{ padding: "10px 12px", cursor: "pointer" }}
          role="button"
          tabIndex={0}
          onClick={onToggleMinimize}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") onToggleMinimize();
          }}
        >
          {headerContent}
        </div>
      );
    }

    return (
      <div className="flex items-center justify-between" style={{ padding: "10px 12px" }}>
        {headerContent}
      </div>
    );
  }

  // terminal / compact variant: icon buttons with tooltips
  return (
    <div className={cn("flex items-center justify-between px-4 py-2 shrink-0", !minimized && "border-b border")}>
      <div className="flex items-center gap-2.5 min-w-0">
        {title && <span className="text-xs font-medium text-muted-foreground truncate">{title}</span>}
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
                {(status === "error" || status === "cancelled") && (
                  <AlertCircle className="w-2.5 h-2.5" aria-hidden="true" />
                )}
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
        {headerExtra}
        <TooltipProvider>
          {onToggleMinimize && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground hover:bg-muted"
                  onClick={onToggleMinimize}
                  aria-label={minimized ? "Expand" : "Collapse"}
                >
                  {minimized ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{minimized ? "Expand" : "Collapse"}</TooltipContent>
            </Tooltip>
          )}
          {logsCount > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground hover:bg-muted"
                  onClick={onCopy}
                  aria-label="Copy output"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <ClipboardCopy className="w-3.5 h-3.5" />}
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
                  className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={onCancel}
                  aria-label="Cancel"
                >
                  <Square className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Cancel</TooltipContent>
            </Tooltip>
          )}
          {(status === "error" || status === "cancelled") && onRetry && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-info hover:text-info hover:bg-info/10"
                  onClick={onRetry}
                  aria-label="Retry"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Retry</TooltipContent>
            </Tooltip>
          )}
          {(status === "done" || status === "error" || status === "cancelled") && onDismiss && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground hover:bg-muted"
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
  );
}

// ---------------------------------------------------------------------------
// TerminalScrollIndicator
// ---------------------------------------------------------------------------

function TerminalScrollIndicator({ card, onClick }: { card: boolean; onClick: () => void }) {
  if (card) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-muted border border-border rounded-full text-muted-foreground cursor-pointer shadow-lg"
        style={{ padding: "3px 10px", fontSize: 11 }}
      >
        &#8595; Follow output
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute bottom-16 right-4 bg-muted hover:bg-accent text-foreground rounded-full px-3 py-1.5 text-xs flex items-center gap-1.5 shadow-lg border transition-colors z-10"
    >
      <ArrowDown className="w-3 h-3" />
      New output
    </button>
  );
}

// ---------------------------------------------------------------------------
// TerminalCompletionFooter
// ---------------------------------------------------------------------------

function TerminalCompletionFooter({
  completionData,
  onDismiss,
}: {
  completionData: CompletionData;
  onDismiss?: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-t shrink-0 bg-secondary/50">
      <div className="flex items-center gap-1.5 text-success">
        <CheckCircle2 className="w-3.5 h-3.5" />
        <span className="text-xs font-medium">
          {completionData.diffSummary
            ? `${completionData.diffSummary.filesChanged} file${completionData.diffSummary.filesChanged !== 1 ? "s" : ""} changed`
            : "Complete"}
        </span>
      </div>
      {completionData.diffSummary && (
        <span className="text-[11px] text-muted-foreground">
          <span className="text-success">+{completionData.diffSummary.insertions}</span>{" "}
          <span className="text-destructive">-{completionData.diffSummary.deletions}</span>
        </span>
      )}
      {completionData.branchName && (
        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
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
            className="inline-flex items-center gap-1.5 text-xs font-medium text-info hover:text-info/80 transition-colors"
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
  );
}

// ---------------------------------------------------------------------------
// SessionTerminal (main export)
// ---------------------------------------------------------------------------

export function SessionTerminal({
  logs,
  progress,
  phase,
  status,
  error,
  elapsed,
  title,
  variant = "terminal",
  maxHeight,
  minimized,
  onToggleMinimize,
  clickableHeader,
  onCancel,
  onRetry,
  onDismiss,
  completionData,
  copyFeedback,
  headerExtra,
  "aria-label": ariaLabel,
}: SessionTerminalProps) {
  const card = isCardVariant(variant);
  const resolvedClickableHeader = clickableHeader ?? card;
  const resolvedCopyFeedback = copyFeedback ?? (card ? "inline" : "toast");

  const { containerRef, isAtBottom, scrollToBottom } = useAutoScroll(!minimized && isRunningStatus(status));
  const isRunning = isRunningStatus(status);
  const [copied, setCopied] = useState(false);

  const resolvedMaxHeight = maxHeight ?? (variant === "terminal" ? "100%" : variant === "compact" ? "400px" : "320px");

  const parsedEntries = useMemo(() => {
    resetStreamIdCounter();
    const result: StreamEntry[] = [];
    for (const entry of logs) {
      result.push(...parseStreamLog(entry.log, entry.logType));
    }
    return result;
  }, [logs]);

  const handleCopy = useCallback(async () => {
    const text = logs.map((l) => l.log).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (resolvedCopyFeedback === "toast") {
        toast.success("Copied to clipboard");
      }
      setTimeout(() => setCopied(false), 2000);
    } catch {
      if (resolvedCopyFeedback === "toast") {
        toast.error("Failed to copy");
      }
    }
  }, [logs, resolvedCopyFeedback]);

  // Auto-scroll on new logs when user is near bottom
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll when logs change
  useEffect(() => {
    if (isAtBottom) {
      scrollToBottom();
    }
  }, [logs.length]);

  // Card variant container
  if (card) {
    return (
      <section
        className="bg-muted rounded-lg overflow-hidden"
        style={{
          border: `1px solid ${
            status === "error" || status === "cancelled"
              ? "hsl(var(--destructive))"
              : status === "done"
                ? "hsl(var(--success))"
                : "hsl(var(--border))"
          }`,
        }}
        aria-label={ariaLabel}
      >
        <TerminalHeader
          status={status}
          title={title}
          phase={phase}
          elapsed={elapsed}
          progress={progress}
          variant={variant}
          minimized={minimized}
          copied={copied}
          logsCount={logs.length}
          isRunning={isRunning}
          clickableHeader={resolvedClickableHeader}
          headerExtra={headerExtra}
          onToggleMinimize={onToggleMinimize}
          onCopy={handleCopy}
          onCancel={onCancel}
          onRetry={onRetry}
          onDismiss={onDismiss}
        />

        {/* Progress bar (card style - inline div) */}
        {isRunning && progress !== null && progress > 0 && (
          <div className="bg-card mx-3" style={{ height: 2 }}>
            <div
              className="bg-primary rounded-full"
              style={{
                height: "100%",
                width: `${progress}%`,
                transition: "width 300ms ease",
              }}
            />
          </div>
        )}

        {/* Log area */}
        {!minimized && (
          <div className="relative">
            <div
              ref={containerRef}
              className="border-t border-border"
              role="log"
              aria-live="polite"
              aria-label={ariaLabel ?? title ?? "Session output"}
              style={{
                maxHeight: typeof resolvedMaxHeight === "string" ? resolvedMaxHeight : undefined,
                overflowY: "auto",
                padding: "8px 12px",
              }}
            >
              {parsedEntries.length === 0 ? (
                <div className="text-xs text-muted-foreground" style={{ padding: "8px 0" }}>
                  {isRunning ? "Waiting for output..." : "No logs available"}
                </div>
              ) : (
                <StreamingDisplay entries={parsedEntries} variant="terminal" live={isRunning} />
              )}

              {/* Error display */}
              {error && (
                <div
                  className="text-destructive rounded-sm border border-destructive/15 bg-destructive/[0.08]"
                  style={{ marginTop: 8, padding: "6px 8px", fontSize: 12 }}
                >
                  {error}
                </div>
              )}
            </div>

            {/* Scroll-to-bottom button */}
            {!isAtBottom && isRunning && <TerminalScrollIndicator card onClick={scrollToBottom} />}
          </div>
        )}
      </section>
    );
  }

  // terminal / compact variant container
  return (
    <section
      className="bg-secondary rounded-lg border flex flex-col overflow-hidden relative"
      style={{
        maxHeight: resolvedMaxHeight,
        height: variant === "terminal" ? "100%" : undefined,
      }}
      aria-label={ariaLabel}
    >
      <TerminalHeader
        status={status}
        title={title}
        phase={phase}
        elapsed={elapsed}
        progress={progress}
        variant={variant}
        minimized={minimized}
        copied={copied}
        logsCount={logs.length}
        isRunning={isRunning}
        clickableHeader={resolvedClickableHeader}
        headerExtra={headerExtra}
        onToggleMinimize={onToggleMinimize}
        onCopy={handleCopy}
        onCancel={onCancel}
        onRetry={onRetry}
        onDismiss={onDismiss}
      />

      {!minimized && (
        <>
          {/* Progress bar (Progress component) */}
          {progress !== null && (
            <div className="px-4 py-1.5 border-b shrink-0">
              <Progress value={progress} className="h-1.5" />
            </div>
          )}

          {/* Log output */}
          <div
            ref={containerRef}
            role="log"
            aria-live="polite"
            aria-label={ariaLabel ?? title ?? "Session output"}
            className="flex-1 overflow-y-auto p-3 space-y-0 min-h-0"
          >
            <StreamingDisplay entries={parsedEntries} variant="terminal" live={isRunning} />

            {status === "error" && error && (
              <div className="flex items-center gap-2 text-destructive mt-3 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {status === "cancelled" && error && (
              <div className="flex items-center gap-2 text-destructive mt-3 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {status === "done" && logs.length === 0 && (
              <div className="flex items-center gap-2 text-success text-xs">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Completed successfully</span>
              </div>
            )}
          </div>

          {/* Scroll-to-bottom indicator */}
          {!isAtBottom && isRunning && <TerminalScrollIndicator card={false} onClick={scrollToBottom} />}

          {/* Completion footer with PR link and diff summary */}
          {status === "done" && completionData && !completionData.noChanges && (
            <TerminalCompletionFooter completionData={completionData} onDismiss={onDismiss} />
          )}

          {/* Footer action buttons (non-PR completion or error) */}
          {(status === "error" ||
            status === "cancelled" ||
            (status === "done" && (!completionData || completionData.noChanges))) &&
            (onRetry || onDismiss) && (
              <div className="flex items-center gap-2 px-4 py-2 border-t shrink-0">
                {status === "done" && (
                  <div className="flex items-center gap-1.5 text-success">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span className="text-xs font-medium">
                      {completionData?.noChanges ? "No changes needed" : "Complete"}
                    </span>
                  </div>
                )}
                {(status === "error" || status === "cancelled") && (
                  <div className="flex items-center gap-1.5 text-destructive">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span className="text-xs font-medium">{status === "cancelled" ? "Cancelled" : "Failed"}</span>
                  </div>
                )}
                <div className="ml-auto flex items-center gap-2">
                  {(status === "error" || status === "cancelled") && onRetry && (
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onRetry}>
                      <RefreshCw className="w-3 h-3 mr-1" />
                      Retry
                    </Button>
                  )}
                  {(status === "done" || status === "error" || status === "cancelled") && onDismiss && (
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onDismiss}>
                      Dismiss
                    </Button>
                  )}
                </div>
              </div>
            )}
        </>
      )}
    </section>
  );
}
