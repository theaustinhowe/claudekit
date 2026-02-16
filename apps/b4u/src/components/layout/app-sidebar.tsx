"use client";

import { cn } from "@devkit/ui";
import { Popover, PopoverContent, PopoverTrigger } from "@devkit/ui/components/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@devkit/ui/components/tooltip";
import { Clock, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

interface RunEntry {
  runId: string | null;
  projectPath: string;
  projectName: string;
  status: string;
  latestSessionType: string;
  sessionCount: number;
  startedAt: string | null;
  completedAt: string | null;
  hasError: boolean;
  errorMessage: string | null;
}

const SESSION_TYPE_PHASE: Record<string, number> = {
  "analyze-project": 1,
  "generate-outline": 2,
  "generate-data-plan": 3,
  "generate-scripts": 4,
  recording: 5,
  "voiceover-audio": 6,
  "final-merge": 7,
};

function phaseLabel(run: RunEntry): string {
  const phase = SESSION_TYPE_PHASE[run.latestSessionType];
  if (!phase) return `${run.sessionCount} step${run.sessionCount !== 1 ? "s" : ""}`;
  if (phase === 7 && (run.status === "done" || run.status === "completed")) return "Completed";
  return `Phase ${phase} of 7`;
}

type StatusVariant = "done" | "running" | "error" | "pending";

function statusVariant(run: RunEntry): StatusVariant {
  if (run.hasError) return "error";
  switch (run.status) {
    case "done":
    case "completed":
      return "done";
    case "running":
    case "in_progress":
      return "running";
    default:
      return "pending";
  }
}

function statusLabel(run: RunEntry): string {
  if (run.hasError) return "Error";
  switch (run.status) {
    case "done":
    case "completed":
      return "Done";
    case "running":
    case "in_progress":
      return "Running";
    default:
      return "Pending";
  }
}

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const diff = Date.now() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}

const VARIANT_COLORS: Record<StatusVariant, string> = {
  done: "text-success",
  running: "text-warning",
  error: "text-destructive",
  pending: "text-muted-foreground",
};

function StatusPill({ run }: { run: RunEntry }) {
  const variant = statusVariant(run);
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-sm text-[10px] font-semibold leading-4 tracking-wide shrink-0",
        VARIANT_COLORS[variant],
        variant === "done" && "bg-success/10",
        variant === "running" && "bg-warning/10",
        variant === "error" && "bg-destructive/10",
        variant === "pending" && "bg-muted",
      )}
    >
      {statusLabel(run)}
    </span>
  );
}

function RunCard({
  run,
  collapsed,
  onSelect,
  onDelete,
}: {
  run: RunEntry;
  collapsed: boolean;
  onSelect?: (runId: string) => void;
  onDelete?: (runId: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const variant = statusVariant(run);

  if (collapsed) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "w-10 h-10 rounded-md border flex items-center justify-center text-2xs font-bold transition-colors",
              "border-border hover:border-primary/50 hover:bg-accent",
              VARIANT_COLORS[variant],
            )}
            onClick={() => run.runId && onSelect?.(run.runId)}
          >
            {run.projectName.charAt(0).toUpperCase()}
          </button>
        </PopoverTrigger>
        <PopoverContent side="right" className="w-56 p-3">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-foreground truncate">{run.projectName}</span>
              <StatusPill run={run} />
            </div>
            <span className="text-xs text-muted-foreground">{phaseLabel(run)}</span>
            {relativeTime(run.startedAt) && (
              <span className="text-xs text-muted-foreground">{relativeTime(run.startedAt)}</span>
            )}
            {run.hasError && run.errorMessage && (
              <span className="text-xs text-destructive/80 truncate">{run.errorMessage}</span>
            )}
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: card contains nested delete button, cannot be a single button element
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => run.runId && onSelect?.(run.runId)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") run.runId && onSelect?.(run.runId);
      }}
      role="button"
      tabIndex={0}
      className={cn(
        "relative flex flex-col gap-1 p-3 pl-4 rounded-md border cursor-pointer transition-all overflow-hidden",
        hovered ? "bg-accent border-border" : "bg-card border-border",
      )}
    >
      {/* Left accent strip */}
      <div
        className={cn(
          "absolute left-0 top-0 bottom-0 w-[3px] rounded-l-md",
          variant === "done" && "bg-success",
          variant === "running" && "bg-warning",
          variant === "error" && "bg-destructive",
          variant === "pending" && "bg-muted-foreground",
        )}
      />

      {/* Delete button */}
      {hovered && run.runId && onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (run.runId) onDelete(run.runId);
          }}
          className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-sm border border-border bg-card hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-colors z-10"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Line 1 */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-foreground truncate min-w-0">{run.projectName}</span>
        <span className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">{relativeTime(run.startedAt)}</span>
      </div>

      {/* Line 2 */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground truncate min-w-0">
          {phaseLabel(run)} &middot; {run.sessionCount} step{run.sessionCount !== 1 ? "s" : ""}
        </span>
        <StatusPill run={run} />
      </div>

      {/* Error */}
      {run.hasError && run.errorMessage && (
        <span className="text-xs text-destructive/80 truncate">{run.errorMessage}</span>
      )}
    </div>
  );
}

export function SessionList({
  collapsed,
  onSelectRun,
  onDeleteRun,
  onNewThread,
}: {
  collapsed: boolean;
  onSelectRun?: (runId: string) => void;
  onDeleteRun?: (runId: string) => void;
  onNewThread?: () => void;
}) {
  const [runs, setRuns] = useState<RunEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sessions/history");
      if (!res.ok) return;
      const data = await res.json();
      setRuns(data.runs || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleDelete = useCallback(
    async (runId: string) => {
      try {
        const res = await fetch(`/api/runs/${runId}`, { method: "DELETE" });
        if (!res.ok) return;
        setRuns((prev) => prev.filter((r) => r.runId !== runId));
        onDeleteRun?.(runId);
      } catch {
        // Silent fail
      }
    },
    [onDeleteRun],
  );

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header: New + History on same row */}
      {!collapsed ? (
        <div className="flex items-center justify-between px-2 pt-2">
          <span className="text-2xs font-medium text-muted-foreground uppercase tracking-wider px-2">History</span>
          {onNewThread && (
            <button
              type="button"
              onClick={onNewThread}
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-muted-foreground border border-sidebar-border rounded-md hover:text-primary hover:border-primary/50 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              New
            </button>
          )}
        </div>
      ) : (
        onNewThread && (
          <div className="px-2 pt-2 flex justify-center">
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={onNewThread}
                    className="w-10 h-10 flex items-center justify-center rounded-md border border-sidebar-border text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">New thread</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )
      )}

      {/* Session list */}
      <div className="flex-1 overflow-y-auto p-2 min-h-0 scrollbar-none">
        {loading ? (
          <div className="flex items-center justify-center py-8 gap-2">
            <div className="w-3 h-3 rounded-full bg-primary/60 animate-pulse" />
            {!collapsed && <span className="text-xs text-muted-foreground">Loading...</span>}
          </div>
        ) : runs.length === 0 ? (
          !collapsed ? (
            <div className="flex flex-col items-center justify-center gap-2 pt-16">
              <Clock className="w-6 h-6 text-muted-foreground/40" />
              <span className="text-xs text-muted-foreground">No sessions yet</span>
              <span className="text-2xs text-muted-foreground/70">Select a project to get started</span>
            </div>
          ) : null
        ) : (
          <div className={cn("flex flex-col gap-1.5", collapsed && "items-center")}>
            {runs.map((run, idx) => (
              <RunCard
                key={run.runId ?? `legacy-${idx}`}
                run={run}
                collapsed={collapsed}
                onSelect={onSelectRun}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
