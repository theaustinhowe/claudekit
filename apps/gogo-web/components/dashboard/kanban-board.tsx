"use client";

import { useMemo } from "react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsMobile } from "@devkit/hooks";
import { COLUMN_GROUPS, type ColumnGroup, JOB_STATUS_CONFIG, type Job, type JobStatus } from "@/types/job";
import { ATTENTION_STATES, type FilterType } from "./job-filters";
import { KanbanColumn } from "./kanban-column";

interface KanbanBoardProps {
  jobs: Job[];
  onJobClick: (job: Job) => void;
  filter?: FilterType;
}

export function KanbanBoard({ jobs, onJobClick, filter = "active" }: KanbanBoardProps) {
  const isMobile = useIsMobile();

  // Filter jobs based on active filter
  const filteredJobs = useMemo(() => {
    if (filter === "attention") {
      return jobs.filter((job) => ATTENTION_STATES.includes(job.status as JobStatus));
    }
    if (filter === "completed") {
      return jobs.filter((job) => job.status === "done");
    }
    // "active": all non-completed jobs
    return jobs.filter((job) => job.status !== "done");
  }, [jobs, filter]);

  // Column groups to show based on filter
  const visibleGroups: ColumnGroup[] = useMemo(() => {
    if (filter === "attention") {
      // Split each attention status into its own column
      return ATTENTION_STATES.map((status) => {
        const config = JOB_STATUS_CONFIG[status];
        return {
          id: status,
          label: config.label,
          statuses: [status],
          color: config.color,
          bgColor: config.bgColor,
        };
      });
    }
    if (filter === "completed") {
      return COLUMN_GROUPS.filter((group) => group.id === "completed");
    }
    // "active": all except completed and attention
    return COLUMN_GROUPS.filter((group) => group.id !== "completed" && group.id !== "attention");
  }, [filter]);

  // Mobile: Tab-based navigation
  if (isMobile) {
    const defaultTab = visibleGroups.length > 0 ? visibleGroups[0].id : "queued";

    return (
      <Tabs defaultValue={defaultTab} className="flex h-full flex-col">
        <div className="border-b px-4 py-2">
          <ScrollArea className="w-full">
            <TabsList className="inline-flex h-9 w-max gap-1 bg-transparent p-0">
              {visibleGroups.map((group) => {
                const count = filteredJobs.filter((j) => group.statuses.includes(j.status as JobStatus)).length;
                return (
                  <TabsTrigger
                    key={group.id}
                    value={group.id}
                    className="rounded-full px-3 py-1.5 text-xs font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                  >
                    {group.label} ({count})
                  </TabsTrigger>
                );
              })}
            </TabsList>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </div>

        {visibleGroups.map((group) => (
          <TabsContent key={group.id} value={group.id} className="mt-0 flex-1 overflow-hidden">
            <ScrollArea className="h-full p-4">
              <div className="flex flex-col gap-3">
                <KanbanColumn group={group} jobs={filteredJobs} onJobClick={onJobClick} compact />
                {filteredJobs.filter((j) => group.statuses.includes(j.status as JobStatus)).length === 0 && (
                  <div className="flex h-32 items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/20">
                    <p className="text-sm text-muted-foreground">No jobs in this status</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        ))}
      </Tabs>
    );
  }

  // Desktop: Traditional Kanban columns
  return (
    <ScrollArea className="h-full w-full">
      <div className="flex h-full gap-4 p-6">
        {visibleGroups.map((group) => (
          <KanbanColumn key={group.id} group={group} jobs={filteredJobs} onJobClick={onJobClick} />
        ))}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}
