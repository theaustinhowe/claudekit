"use client";

import type { Job } from "@devkit/gogo-shared";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, Clock, ExternalLink, Info } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useStaleJobs } from "@/hooks/use-jobs";
import { cn } from "@devkit/ui";

interface StaleJobsAlertProps {
  onJobSelect?: (jobId: string) => void;
  className?: string;
}

/**
 * Alert component that shows when there are stale jobs that may need attention.
 * Stale jobs are those in running/needs_info states that haven't been updated for over an hour.
 */
export function StaleJobsAlert({ onJobSelect, className }: StaleJobsAlertProps) {
  const { data: staleData, isLoading } = useStaleJobs(60); // 60 minute threshold
  const [isOpen, setIsOpen] = useState(true);

  // Don't show anything while loading or if there are no stale jobs
  if (isLoading || !staleData?.data || staleData.data.length === 0) {
    return null;
  }

  const staleJobs = staleData.data;
  const runningCount = staleJobs.filter((j) => j.status === "running").length;
  const needsInfoCount = staleJobs.filter((j) => j.status === "needs_info").length;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className={cn("rounded-lg border border-yellow-500 bg-yellow-50 dark:bg-yellow-950/30 p-4", className)}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-300">
            <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
            <Clock className="h-4 w-4" />
            <span className="font-semibold">
              {staleJobs.length} Stale Job{staleJobs.length !== 1 && "s"} Detected
            </span>
          </div>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-yellow-600 dark:text-yellow-400 hover:text-yellow-700 dark:hover:text-yellow-300"
            >
              {isOpen ? "Hide" : "Show"}
            </Button>
          </CollapsibleTrigger>
        </div>
        <div className="text-yellow-600 dark:text-yellow-400">
          <p className="text-sm mb-2">
            These jobs haven&apos;t been updated for over an hour:
            {runningCount > 0 && <span className="font-medium"> {runningCount} running</span>}
            {runningCount > 0 && needsInfoCount > 0 && ","}
            {needsInfoCount > 0 && <span className="font-medium"> {needsInfoCount} waiting for info</span>}
          </p>

          <CollapsibleContent>
            <div className="space-y-2 mt-3">
              {staleJobs.map((job) => (
                <StaleJobItem key={job.id} job={job} onSelect={() => onJobSelect?.(job.id)} />
              ))}
            </div>
            <p className="text-xs text-yellow-500 dark:text-yellow-500 mt-3 flex items-center gap-1">
              <Info className="h-3 w-3" />
              Consider checking logs or pausing jobs that appear stuck.
            </p>
          </CollapsibleContent>
        </div>
      </div>
    </Collapsible>
  );
}

interface StaleJobItemProps {
  job: Job;
  onSelect?: () => void;
}

function StaleJobItem({ job, onSelect }: StaleJobItemProps) {
  const lastUpdated = job.updatedAt ? formatDistanceToNow(new Date(job.updatedAt), { addSuffix: true }) : "unknown";

  return (
    <div
      className={cn(
        "flex items-center justify-between p-2 rounded-md",
        "bg-yellow-100/50 dark:bg-yellow-900/30",
        "border border-yellow-200 dark:border-yellow-800",
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-yellow-700 dark:text-yellow-300">#{job.issueNumber}</span>
          <span className="text-sm font-medium text-yellow-800 dark:text-yellow-200 truncate">{job.issueTitle}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-yellow-600 dark:text-yellow-400">
          <span
            className={cn(
              "px-1.5 py-0.5 rounded text-[10px] font-medium uppercase",
              job.status === "running"
                ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                : "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
            )}
          >
            {job.status === "needs_info" ? "needs info" : job.status}
          </span>
          <span>Last updated {lastUpdated}</span>
        </div>
      </div>
      {onSelect && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onSelect}
          className="shrink-0 h-7 text-yellow-600 dark:text-yellow-400 hover:text-yellow-700 dark:hover:text-yellow-300"
        >
          <ExternalLink className="h-3 w-3 mr-1" />
          View
        </Button>
      )}
    </div>
  );
}
