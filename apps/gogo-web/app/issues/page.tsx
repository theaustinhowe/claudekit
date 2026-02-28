"use client";

import { type PageTab, PageTabs } from "@claudekit/ui/components/page-tabs";
import { ScrollArea } from "@claudekit/ui/components/scroll-area";
import { Skeleton } from "@claudekit/ui/components/skeleton";
import { Inbox } from "lucide-react";
import { parseAsInteger, parseAsStringLiteral, useQueryState } from "nuqs";
import { Suspense, useMemo, useState } from "react";
import { toast } from "sonner";
import { CreateIssueDialog } from "@/components/issues/create-issue-dialog";
import { IssueDetailDrawer } from "@/components/issues/issue-detail-drawer";
import { IssueList } from "@/components/issues/issue-list";
import { RepoSelector } from "@/components/repo/repo-selector";
import { useRepositoryContext } from "@/contexts/repository-context";
import { useCreateIssue, useCreateJobFromIssue, useIssues } from "@/hooks/use-issues";
import { useJobs } from "@/hooks/use-jobs";
import type { GitHubIssue } from "@/lib/api";

const tabIds = ["open", "in-progress", "closed"] as const;

function IssuesPageSkeleton() {
  const defaultTabs: PageTab[] = [
    { id: "open", label: "Open" },
    { id: "in-progress", label: "In Progress" },
    { id: "closed", label: "Closed" },
  ];

  return (
    <div className="flex h-full flex-col">
      <PageTabs tabs={defaultTabs} value="open" onValueChange={() => {}} />
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

function IssuesPageContent() {
  const [currentTab, setCurrentTab] = useQueryState("tab", parseAsStringLiteral(tabIds).withDefault("open"));
  const [selectedIssueNumber, setSelectedIssueNumber] = useQueryState("issue", parseAsInteger);

  const { repositories, selectedRepoId } = useRepositoryContext();
  const [creatingJobForIssue, setCreatingJobForIssue] = useState<number | null>(null);

  // Check if a specific repo is selected
  const hasRepoSelected = selectedRepoId !== "all";

  // Fetch both open and closed issues for counts
  const { data: openIssuesResponse, isLoading: loadingOpen } = useIssues(hasRepoSelected ? selectedRepoId : undefined, {
    state: "open",
  });
  const { data: closedIssuesResponse, isLoading: loadingClosed } = useIssues(
    hasRepoSelected ? selectedRepoId : undefined,
    { state: "closed" },
  );

  // Fetch jobs to determine which issues are in progress
  const { data: jobsResponse } = useJobs({
    repositoryId: hasRepoSelected ? selectedRepoId : undefined,
  });

  // Mutations
  const createIssueMutation = useCreateIssue(hasRepoSelected ? selectedRepoId : undefined);
  const createJobMutation = useCreateJobFromIssue(hasRepoSelected ? selectedRepoId : undefined);

  // Show repo selector only when there are multiple repositories
  const showRepoSelector = repositories.length > 1;

  // Get issues from responses
  const openIssues = openIssuesResponse?.data ?? [];
  const closedIssues = closedIssuesResponse?.data ?? [];
  const jobs = jobsResponse?.data ?? [];

  const isLoading = loadingOpen || loadingClosed;

  // Get issue numbers that have active jobs (any status except done/failed)
  const issuesWithActiveJobs = useMemo(() => {
    const completedStatuses = ["done", "failed"];
    return new Set(jobs.filter((job) => !completedStatuses.includes(job.status)).map((job) => job.issueNumber));
  }, [jobs]);

  // Calculate counts for each tab
  const counts = useMemo(() => {
    const openCount = openIssues.filter((issue) => !issuesWithActiveJobs.has(issue.number)).length;
    const inProgressCount = openIssues.filter((issue) => issuesWithActiveJobs.has(issue.number)).length;
    const closedCount = closedIssues.length;

    return {
      open: openCount,
      "in-progress": inProgressCount,
      closed: closedCount,
    };
  }, [openIssues, closedIssues, issuesWithActiveJobs]);

  // Build tabs with counts
  const tabs: PageTab[] = useMemo(
    () => [
      { id: "open", label: "Open", count: counts.open },
      { id: "in-progress", label: "In Progress", count: counts["in-progress"] },
      { id: "closed", label: "Closed", count: counts.closed },
    ],
    [counts],
  );

  // Filter issues based on current tab
  const issues = useMemo(() => {
    if (currentTab === "in-progress") {
      return openIssues.filter((issue) => issuesWithActiveJobs.has(issue.number));
    }
    if (currentTab === "open") {
      return openIssues.filter((issue) => !issuesWithActiveJobs.has(issue.number));
    }
    return closedIssues;
  }, [openIssues, closedIssues, currentTab, issuesWithActiveJobs]);

  // Find selected issue
  const selectedIssue = useMemo(() => {
    if (!selectedIssueNumber) return null;
    return (
      openIssues.find((i) => i.number === selectedIssueNumber) ||
      closedIssues.find((i) => i.number === selectedIssueNumber) ||
      null
    );
  }, [selectedIssueNumber, openIssues, closedIssues]);

  // Handle create issue
  const handleCreateIssue = (data: { title: string; body?: string; labels?: string[] }) => {
    createIssueMutation.mutate(data, {
      onSuccess: (response) => {
        toast.success("Issue Created", {
          description: `Issue #${response.data.number} created successfully.`,
        });
      },
      onError: (error) => {
        toast.error("Failed to Create Issue", { description: error.message });
      },
    });
  };

  // Handle create job from issue
  const handleCreateJob = (issueNumber: number) => {
    setCreatingJobForIssue(issueNumber);
    createJobMutation.mutate(issueNumber, {
      onSuccess: (response) => {
        toast.success("Job Created", { description: response.message });
        setCreatingJobForIssue(null);
      },
      onError: (error) => {
        toast.error("Failed to Create Job", { description: error.message });
        setCreatingJobForIssue(null);
      },
    });
  };

  const handleIssueClick = (issue: GitHubIssue) => {
    setSelectedIssueNumber(issue.number);
  };

  const handleDrawerClose = () => {
    setSelectedIssueNumber(null);
  };

  // Render "select repo" prompt when no specific repo is selected
  if (!hasRepoSelected) {
    return (
      <div className="flex h-full flex-col">
        <PageTabs tabs={tabs} value={currentTab} onValueChange={setCurrentTab} />
        <div className="flex h-full flex-col items-center justify-center p-8 text-center">
          <div className="mb-4 rounded-full bg-muted p-4">
            <Inbox className="h-10 w-10 text-muted-foreground" />
          </div>
          <h2 className="mb-2 text-xl font-semibold">Select a Repository</h2>
          <p className="mb-6 max-w-md text-muted-foreground">
            Choose a specific repository to view its issues. The "All Repositories" view is not available for issues.
          </p>
          {showRepoSelector && (
            <div className="w-full max-w-xs">
              <RepoSelector />
            </div>
          )}
        </div>
      </div>
    );
  }

  // Render loading state
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
      <PageTabs
        tabs={tabs}
        value={currentTab}
        onValueChange={setCurrentTab}
        actions={<CreateIssueDialog onSubmit={handleCreateIssue} isLoading={createIssueMutation.isPending} compact />}
      />

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {issues.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center p-8 text-center">
            <div className="mb-4 rounded-full bg-muted p-4">
              <Inbox className="h-10 w-10 text-muted-foreground" />
            </div>
            <h2 className="mb-2 text-xl font-semibold">No issues</h2>
            <p className="mb-6 max-w-md text-muted-foreground">
              {currentTab === "open"
                ? "There are no open issues available for work."
                : currentTab === "in-progress"
                  ? "There are no issues currently being worked on."
                  : "There are no closed issues in this repository."}
            </p>
            {currentTab === "open" && (
              <CreateIssueDialog onSubmit={handleCreateIssue} isLoading={createIssueMutation.isPending} />
            )}
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="p-6">
              <IssueList
                issues={issues}
                onIssueClick={handleIssueClick}
                onCreateJob={handleCreateJob}
                creatingJobForIssue={creatingJobForIssue}
              />
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Issue detail drawer */}
      <IssueDetailDrawer
        issue={selectedIssue}
        repositoryId={hasRepoSelected ? selectedRepoId : undefined}
        open={selectedIssueNumber !== null}
        onOpenChange={(open) => {
          if (!open) handleDrawerClose();
        }}
        onCreateJob={handleCreateJob}
        createJobLoading={creatingJobForIssue === selectedIssue?.number}
      />
    </div>
  );
}

export default function IssuesPage() {
  return (
    <Suspense fallback={<IssuesPageSkeleton />}>
      <IssuesPageContent />
    </Suspense>
  );
}
