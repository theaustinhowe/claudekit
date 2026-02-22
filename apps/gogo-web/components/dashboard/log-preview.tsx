"use client";

import type { JobLog } from "@claudekit/gogo-shared";
import { cn } from "@claudekit/ui";
import { Terminal } from "lucide-react";
import { useMemo } from "react";
import { useJobLogs } from "@/hooks/use-jobs";

interface LogPreviewProps {
  jobId: string;
  maxLines?: number;
  className?: string;
}

// ANSI escape code regex pattern (as string to avoid biome control char warning)
// biome-ignore lint/complexity/useRegexLiterals: Using RegExp constructor to avoid control character warning
const ANSI_PATTERN = new RegExp("[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]", "g");

/**
 * Format a log line for display, stripping ANSI codes and excessive whitespace
 */
function formatLogLine(content: string): string {
  // Strip ANSI escape codes
  const stripped = content.replace(ANSI_PATTERN, "");
  // Collapse multiple spaces and trim
  return stripped.replace(/\s+/g, " ").trim();
}

/**
 * Get the stream color for a log entry
 */
function getStreamColor(stream: string): string {
  switch (stream) {
    case "stderr":
      return "text-red-600 dark:text-red-400";
    case "system":
      return "text-blue-600 dark:text-blue-400";
    default:
      return "text-foreground/80";
  }
}

/**
 * Filter and dedupe log lines for preview display
 */
function getPreviewLines(logs: JobLog[], maxLines: number): { id: string; content: string; stream: string }[] {
  // Get the last N*2 logs to filter, then take the most meaningful ones
  const recentLogs = logs.slice(-maxLines * 2);

  // Filter out empty lines and very short outputs
  const meaningful = recentLogs.filter((log) => {
    const content = formatLogLine(log.content);
    return content.length > 3;
  });

  // Take the last maxLines
  return meaningful.slice(-maxLines).map((log) => ({
    id: log.id,
    content: formatLogLine(log.content),
    stream: log.stream,
  }));
}

export function LogPreview({ jobId, maxLines = 5, className }: LogPreviewProps) {
  const { data: logs = [] } = useJobLogs(jobId);

  const previewLines = useMemo(() => getPreviewLines(logs, maxLines), [logs, maxLines]);

  if (previewLines.length === 0) {
    return null;
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Terminal className="h-3.5 w-3.5" />
        <span>Recent output</span>
      </div>
      <div className="bg-gray-900 dark:bg-gray-950 rounded-md p-3 font-mono text-xs overflow-hidden">
        <div className="space-y-0.5">
          {previewLines.map((line) => (
            <div
              key={line.id}
              className={cn("truncate", getStreamColor(line.stream), line.stream === "stderr" && "font-medium")}
            >
              {line.content}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
