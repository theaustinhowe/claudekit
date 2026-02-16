"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import { Suspense, useEffect, useMemo } from "react";
import { JobDetailDrawer } from "@/components/dashboard/job-detail-drawer";
import { JobFilters } from "@/components/dashboard/job-filters";
import { KanbanBoard } from "@/components/dashboard/kanban-board";
import { StaleJobsAlert } from "@/components/dashboard/stale-jobs-alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useRepositoryContext } from "@/contexts/repository-context";
import { useJobs } from "@/hooks/use-jobs";
import { useSetupStatus } from "@/hooks/use-setup";
import type { Job } from "@/types/job";

function DashboardSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-hidden p-6">
        <div className="flex h-full gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholders
            <div key={i} className="w-72 shrink-0 space-y-3">
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DashboardContent() {
  const router = useRouter();
  const { data: setupStatus, isLoading: isSetupLoading } = useSetupStatus();
  const { selectedRepoId } = useRepositoryContext();

  // URL state with nuqs
  const [selectedJobId, setSelectedJobId] = useQueryState("job", parseAsString.withOptions({ shallow: false }));
  const [activeFilter, setActiveFilter] = useQueryState(
    "filter",
    parseAsStringLiteral(["active", "attention", "completed"] as const).withDefault("active"),
  );

  // Drawer is open when a job is selected
  const drawerOpen = selectedJobId !== null;

  // Filter jobs by selected repository
  const {
    data: jobsResponse,
    isLoading: isJobsLoading,
    error,
    refetch,
  } = useJobs({
    repositoryId: selectedRepoId === "all" ? undefined : selectedRepoId,
  });

  // Redirect to setup if needed
  useEffect(() => {
    if (setupStatus?.needsSetup) {
      router.replace("/setup");
    }
  }, [setupStatus, router]);

  const isLoading = isSetupLoading || isJobsLoading;

  const jobs = useMemo(() => jobsResponse?.data ?? [], [jobsResponse]);

  // Calculate queue position and jobs ahead for the selected job if it's queued
  const queueInfo = useMemo(() => {
    if (!selectedJobId) return undefined;
    const queuedJobs = jobs.filter((job) => job.status === "queued");
    const position = queuedJobs.findIndex((job) => job.id === selectedJobId);
    if (position < 0) return undefined;
    const jobsAhead = queuedJobs.slice(0, position);
    return {
      position: position + 1,
      jobsAhead: jobsAhead.map((j) => ({
        id: j.id,
        issueNumber: j.issueNumber,
        issueTitle: j.issueTitle,
      })),
    };
  }, [jobs, selectedJobId]);

  const handleJobClick = (job: Job) => {
    setSelectedJobId(job.id);
  };

  const handleDrawerClose = () => {
    setSelectedJobId(null);
  };

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (error) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-xl font-semibold mb-2">Failed to load jobs</h2>
            <p className="text-muted-foreground mb-4">
              {error instanceof Error ? error.message : "Please check the orchestrator is running."}
            </p>
            <Button variant="outline" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <StaleJobsAlert onJobSelect={(jobId) => setSelectedJobId(jobId)} className="mx-4 mt-4" />
      <JobFilters jobs={jobs} activeFilter={activeFilter} onFilterChange={setActiveFilter} />
      <div className="flex-1 overflow-hidden">
        <KanbanBoard jobs={jobs} onJobClick={handleJobClick} filter={activeFilter} />
      </div>
      <JobDetailDrawer
        jobId={selectedJobId}
        open={drawerOpen}
        onOpenChange={(open) => {
          if (!open) handleDrawerClose();
        }}
        queuePosition={queueInfo?.position}
        jobsAhead={queueInfo?.jobsAhead}
      />
    </div>
  );
}

export default function Dashboard() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardContent />
    </Suspense>
  );
}
