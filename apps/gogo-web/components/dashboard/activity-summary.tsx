"use client";

import type { JobLog } from "@claudekit/gogo-shared";
import { cn } from "@claudekit/ui";
import { differenceInMinutes, formatDistanceToNow } from "date-fns";
import { Activity, AlertTriangle, Loader2 } from "lucide-react";
import { useMemo } from "react";
import { useJobLogs } from "@/hooks/use-jobs";
import { PhaseProgress } from "./phase-progress";

// Threshold in minutes before showing stale indicator
const STALE_THRESHOLD_MINUTES = 5;

interface ActivitySummaryProps {
  jobId: string;
  isRunning: boolean;
  className?: string;
}

/**
 * Extracts a meaningful activity summary from recent logs.
 * Looks for patterns like file modifications, test runs, analysis, etc.
 */
export function extractActivitySummary(logs: { content: string; stream: string }[]): string | null {
  if (logs.length === 0) return null;

  // Get the last 20 logs to analyze
  const recentLogs = logs.slice(-20);

  // Look for meaningful patterns in reverse order (most recent first)
  for (let i = recentLogs.length - 1; i >= 0; i--) {
    const content = recentLogs[i].content.toLowerCase();

    // File modification patterns
    if (content.includes("modifying") || content.includes("editing")) {
      const match = recentLogs[i].content.match(/(?:modifying|editing)\s+[`']?([^`'\s]+)[`']?/i);
      if (match) return `Modifying ${match[1]}`;
    }

    // Creating files
    if (
      content.includes("creating") &&
      (content.includes("file") || content.includes(".ts") || content.includes(".tsx"))
    ) {
      const match = recentLogs[i].content.match(/creating\s+[`']?([^`'\s]+)[`']?/i);
      if (match) return `Creating ${match[1]}`;
    }

    // Running tests
    if (content.includes("running tests") || content.includes("npm test") || content.includes("pnpm test")) {
      return "Running tests";
    }

    // Installing dependencies
    if (content.includes("npm install") || content.includes("pnpm install") || content.includes("installing")) {
      return "Installing dependencies";
    }

    // Analyzing code
    if (content.includes("analyzing") || (content.includes("reading") && content.includes("code"))) {
      return "Analyzing code";
    }

    // Building
    if (content.includes("building") || content.includes("npm run build") || content.includes("pnpm build")) {
      return "Building project";
    }

    // Git operations
    if (content.includes("git commit") || content.includes("committing")) {
      return "Committing changes";
    }
    if (content.includes("git push") || content.includes("pushing")) {
      return "Pushing to remote";
    }

    // Linting
    if (content.includes("linting") || content.includes("eslint") || content.includes("biome")) {
      return "Running linter";
    }
  }

  // Fallback: use the last system message if available
  const lastSystemLog = [...recentLogs].reverse().find((l) => l.stream === "system");
  if (lastSystemLog && lastSystemLog.content.length < 60) {
    return lastSystemLog.content;
  }

  return "Agent is working...";
}

/**
 * Get the timestamp of the most recent log entry
 */
function getLastActivityTime(logs: JobLog[]): Date | null {
  if (logs.length === 0) return null;
  const lastLog = logs[logs.length - 1];
  if (!lastLog.createdAt) return null;
  const date = new Date(lastLog.createdAt);
  // Validate the date is valid
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export function ActivitySummary({ jobId, isRunning, className }: ActivitySummaryProps) {
  const { data: logs = [] } = useJobLogs(jobId);

  const summary = useMemo(() => extractActivitySummary(logs), [logs]);
  const lastActivityTime = useMemo(() => getLastActivityTime(logs), [logs]);
  const lastActivityAgo = lastActivityTime ? formatDistanceToNow(lastActivityTime, { addSuffix: true }) : null;

  // Check if activity is stale (no logs for 5+ minutes)
  const isStale = useMemo(() => {
    if (!lastActivityTime) return false;
    return differenceInMinutes(new Date(), lastActivityTime) >= STALE_THRESHOLD_MINUTES;
  }, [lastActivityTime]);

  if (!isRunning) return null;

  return (
    <div className={cn("space-y-2", className)}>
      {/* Main activity panel */}
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg border",
          isStale
            ? "bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-900"
            : "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900",
        )}
      >
        <div
          className={cn(
            "flex items-center gap-2 shrink-0",
            isStale ? "text-yellow-600 dark:text-yellow-400" : "text-blue-600 dark:text-blue-400",
          )}
        >
          {isStale ? <AlertTriangle className="h-4 w-4" /> : <Loader2 className="h-4 w-4 animate-spin" />}
          <Activity className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span
              className={cn(
                "text-sm font-medium truncate",
                isStale ? "text-yellow-700 dark:text-yellow-300" : "text-blue-700 dark:text-blue-300",
              )}
            >
              {isStale ? "Possibly stalled" : summary || "Agent is working..."}
            </span>
            {lastActivityAgo && (
              <span
                className={cn(
                  "text-xs shrink-0",
                  isStale ? "text-yellow-600 dark:text-yellow-400" : "text-blue-500 dark:text-blue-400",
                )}
              >
                {lastActivityAgo}
              </span>
            )}
          </div>
          {isStale && (
            <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
              No activity for {STALE_THRESHOLD_MINUTES}+ minutes. Agent may be waiting on an external process.
            </p>
          )}
        </div>
      </div>

      {/* Phase progress indicator - compact version */}
      {logs.length > 0 && <PhaseProgress logs={logs} compact className="px-1" />}

      {/* Autonomy reassurance */}
      <p className="text-xs text-muted-foreground px-1">
        {isStale
          ? "Consider checking the logs or pausing the job if it appears stuck."
          : "The agent is working autonomously. No action needed."}
      </p>
    </div>
  );
}
