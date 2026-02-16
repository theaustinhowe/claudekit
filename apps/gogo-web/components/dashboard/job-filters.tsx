"use client";

import { cn } from "@devkit/ui";
import { Badge } from "@devkit/ui/components/badge";
import { Button } from "@devkit/ui/components/button";
import { AlertCircle, CheckCircle2, Filter } from "lucide-react";
import { useMemo } from "react";
import { useRepositoryContext } from "@/contexts/repository-context";
import type { Job, JobStatus } from "@/types/job";
import { CreateManualJobDialog } from "./create-manual-job-dialog";

// States that require user attention
const ATTENTION_STATES: JobStatus[] = ["needs_info", "failed", "paused"];

export type FilterType = "active" | "attention" | "completed";

interface JobFiltersProps {
  jobs: Job[];
  activeFilter: FilterType;
  onFilterChange: (filter: FilterType) => void;
}

export function JobFilters({ jobs, activeFilter, onFilterChange }: JobFiltersProps) {
  const { selectedRepoId } = useRepositoryContext();

  const activeCount = useMemo(() => {
    return jobs.filter((job) => job.status !== "done" && !ATTENTION_STATES.includes(job.status as JobStatus)).length;
  }, [jobs]);

  const attentionCount = useMemo(() => {
    return jobs.filter((job) => ATTENTION_STATES.includes(job.status as JobStatus)).length;
  }, [jobs]);

  const completedCount = useMemo(() => {
    return jobs.filter((job) => job.status === "done").length;
  }, [jobs]);

  // Count specifically needs_info jobs (blocked on user)
  const blockedOnYouCount = useMemo(() => {
    return jobs.filter((job) => job.status === "needs_info").length;
  }, [jobs]);

  return (
    <div className="flex h-12 items-center gap-1.5 sm:gap-2 border-b bg-background px-3 sm:px-4 overflow-x-auto">
      <Filter className="h-4 w-4 text-muted-foreground shrink-0 hidden sm:block" />
      <span className="text-sm text-muted-foreground mr-1 sm:mr-2 hidden sm:inline">Filter:</span>

      <Button
        variant={activeFilter === "active" ? "secondary" : "ghost"}
        size="sm"
        onClick={() => onFilterChange("active")}
        className="h-7 px-2 sm:px-3 shrink-0"
      >
        Active
        <Badge variant="outline" className="ml-1.5 h-5 px-1.5">
          {activeCount}
        </Badge>
      </Button>

      <Button
        variant={activeFilter === "attention" ? "secondary" : "ghost"}
        size="sm"
        onClick={() => onFilterChange("attention")}
        className={cn(
          "h-7 px-2 sm:px-3 shrink-0",
          attentionCount > 0 && activeFilter !== "attention" && "text-orange-600 dark:text-orange-400",
        )}
      >
        <AlertCircle className="h-3.5 w-3.5 mr-1 sm:mr-1.5" />
        <span className="hidden sm:inline">Needs </span>Attention
        <Badge
          variant={attentionCount > 0 && activeFilter !== "attention" ? "destructive" : "outline"}
          className="ml-1.5 h-5 px-1.5"
        >
          {attentionCount}
        </Badge>
      </Button>

      <Button
        variant={activeFilter === "completed" ? "secondary" : "ghost"}
        size="sm"
        onClick={() => onFilterChange("completed")}
        className="h-7 px-2 sm:px-3 shrink-0"
      >
        <CheckCircle2 className="h-3.5 w-3.5 mr-1 sm:mr-1.5" />
        <span className="hidden sm:inline">Completed</span>
        <span className="sm:hidden">Done</span>
        <Badge variant="outline" className="ml-1.5 h-5 px-1.5">
          {completedCount}
        </Badge>
      </Button>

      {/* Blocked on you indicator - hidden on small screens to save space */}
      {blockedOnYouCount > 0 && (
        <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-md bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 text-xs font-medium shrink-0">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-orange-500" />
          </span>
          {blockedOnYouCount} blocked on you
        </div>
      )}

      {/* New Job button */}
      <div className="ml-auto shrink-0">
        <CreateManualJobDialog defaultRepositoryId={selectedRepoId !== "all" ? selectedRepoId : undefined} />
      </div>
    </div>
  );
}

export { ATTENTION_STATES };
