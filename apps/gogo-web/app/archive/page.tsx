"use client";

import { Button } from "@claudekit/ui/components/button";
import { ScrollArea } from "@claudekit/ui/components/scroll-area";
import { Skeleton } from "@claudekit/ui/components/skeleton";
import { Inbox } from "lucide-react";
import Link from "next/link";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { Suspense, useMemo } from "react";
import { toast } from "sonner";
import { ArchivedJobCard } from "@/components/archive/archived-job-card";
import { PageTabs, type Tab } from "@/components/layout/page-tabs";
import { useJobAction, useJobs } from "@/hooks/use-jobs";
import type { Job } from "@/types/job";

const tabIds = ["completed", "failed"] as const;

const defaultTabs: Tab[] = [
  { id: "completed", label: "Completed" },
  { id: "failed", label: "Failed" },
];

function ArchivePageSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <PageTabs tabs={defaultTabs} value="completed" onValueChange={() => {}} />
      <div className="flex-1 p-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholders
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

function ArchivePageContent() {
  const [currentTab, setCurrentTab] = useQueryState("tab", parseAsStringLiteral(tabIds).withDefault("completed"));

  const { data: doneJobsResponse, isLoading: loadingDone } = useJobs({
    status: "done",
  });
  const { data: failedJobsResponse, isLoading: loadingFailed } = useJobs({
    status: "failed",
  });
  const { mutate: performAction } = useJobAction();

  const isLoading = loadingDone || loadingFailed;

  const doneJobs = useMemo(() => {
    return (doneJobsResponse?.data ?? []).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  }, [doneJobsResponse]);

  const failedJobs = useMemo(() => {
    return (failedJobsResponse?.data ?? []).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  }, [failedJobsResponse]);

  const jobs = currentTab === "completed" ? doneJobs : failedJobs;

  // Build tabs with counts
  const tabs: Tab[] = useMemo(
    () => [
      { id: "completed", label: "Completed", count: doneJobs.length },
      { id: "failed", label: "Failed", count: failedJobs.length },
    ],
    [doneJobs.length, failedJobs.length],
  );

  const handleUnarchive = (job: Job) => {
    performAction(
      { jobId: job.id, action: { type: "resume" } },
      {
        onSuccess: () => {
          toast.success("Job Restored", {
            description: `Job #${job.issueNumber} has been returned to the queue.`,
          });
        },
        onError: (error) => {
          toast.error("Failed to restore job", { description: error.message });
        },
      },
    );
  };

  if (isLoading) {
    return (
      <div className="flex h-full flex-col">
        <PageTabs tabs={tabs} value={currentTab} onValueChange={setCurrentTab} />
        <div className="flex-1 p-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholders
              <Skeleton key={i} className="h-40 w-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <PageTabs tabs={tabs} value={currentTab} onValueChange={setCurrentTab} />

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {jobs.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center p-8 text-center">
            <div className="mb-4 rounded-full bg-muted p-4">
              <Inbox className="h-10 w-10 text-muted-foreground" />
            </div>
            <h2 className="mb-2 text-xl font-semibold">No {currentTab} jobs</h2>
            <p className="mb-6 max-w-md text-muted-foreground">
              {currentTab === "completed"
                ? "Successfully completed jobs will appear here."
                : "Failed jobs will appear here."}
            </p>
            <Button asChild>
              <Link href="/">Back to Dashboard</Link>
            </Button>
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="grid gap-4 p-6 md:grid-cols-2 lg:grid-cols-3">
              {jobs.map((job) => (
                <ArchivedJobCard key={job.id} job={job} onUnarchive={handleUnarchive} />
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}

export default function ArchivePage() {
  return (
    <Suspense fallback={<ArchivePageSkeleton />}>
      <ArchivePageContent />
    </Suspense>
  );
}
