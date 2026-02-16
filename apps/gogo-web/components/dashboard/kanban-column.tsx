"use client";

import { ScrollArea } from "@devkit/ui/components/scroll-area";
import type { ColumnGroup, Job, JobStatus } from "@/types/job";
import { JobCard } from "./job-card";

interface KanbanColumnProps {
  group: ColumnGroup;
  jobs: Job[];
  onJobClick: (job: Job) => void;
  compact?: boolean;
}

export function KanbanColumn({ group, jobs, onJobClick, compact }: KanbanColumnProps) {
  // Filter jobs that match any of the statuses in this group
  const filteredJobs = jobs.filter((job) => group.statuses.includes(job.status as JobStatus));

  // Calculate queue position for queued jobs
  const getQueuePosition = (job: Job, _index: number): number | undefined => {
    if (group.id === "queued" && job.status === "queued") {
      // Count only queued jobs up to this index
      const queuedJobs = filteredJobs.filter((j) => j.status === "queued");
      return queuedJobs.findIndex((j) => j.id === job.id) + 1;
    }
    return undefined;
  };

  // Compact mode for mobile - just render cards without column wrapper
  if (compact) {
    return (
      <>
        {filteredJobs.map((job, index) => (
          <JobCard key={job.id} job={job} onClick={onJobClick} queuePosition={getQueuePosition(job, index)} />
        ))}
      </>
    );
  }

  return (
    <div className="flex h-full min-w-[280px] flex-col rounded-lg bg-muted/30 shadow-sm">
      {/* Column header */}
      <div className="flex items-center gap-2 p-3 pb-2">
        <h2 className={`text-sm font-semibold ${group.color}`}>{group.label}</h2>
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-xs font-medium text-muted-foreground">
          {filteredJobs.length}
        </span>
      </div>

      {/* Cards container */}
      <ScrollArea className="flex-1 px-3 pb-3">
        <div className="flex flex-col gap-2 pt-1">
          {filteredJobs.map((job, index) => (
            <JobCard key={job.id} job={job} onClick={onJobClick} queuePosition={getQueuePosition(job, index)} />
          ))}

          {filteredJobs.length === 0 && (
            <div className="flex h-24 items-center justify-center rounded-lg bg-muted/20">
              <p className="text-xs text-muted-foreground">No jobs</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
