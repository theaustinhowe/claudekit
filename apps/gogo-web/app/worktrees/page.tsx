"use client";

import { AlertCircle, Inbox, Lightbulb, RefreshCw, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@devkit/ui/components/button";
import { ScrollArea } from "@devkit/ui/components/scroll-area";
import { Skeleton } from "@devkit/ui/components/skeleton";
import { WorktreeCard } from "@/components/worktrees/worktree-card";
import { useRepositoryContext } from "@/contexts/repository-context";
import { useCleanupWorktree, useWorktrees } from "@/hooks/use-worktrees";
import { fetchPrMergeStatus } from "@/lib/api";

const INFO_DISMISSED_KEY = "workspaces-info-dismissed";

export default function WorktreesPage() {
  const { data: worktreesResponse, isLoading, error, refetch } = useWorktrees();
  const cleanupMutation = useCleanupWorktree();
  const { selectedRepoId } = useRepositoryContext();

  // Dismissible info alert state
  const [infoDismissed, setInfoDismissed] = useState(true); // Start hidden to avoid flicker

  // Load dismissed state from localStorage
  useEffect(() => {
    const dismissed = localStorage.getItem(INFO_DISMISSED_KEY);
    setInfoDismissed(dismissed === "true");
  }, []);

  const dismissInfo = () => {
    setInfoDismissed(true);
    localStorage.setItem(INFO_DISMISSED_KEY, "true");
  };

  // Track PR merge status for jobs with PRs
  const [prMergeStatuses, setPrMergeStatuses] = useState<Record<string, { merged: boolean; loading: boolean }>>({});

  // Track which job IDs we've already fetched to avoid re-fetching
  const fetchedJobIds = useRef<Set<string>>(new Set());

  // Filter worktrees by selected repository
  const worktrees = useMemo(() => {
    const all = worktreesResponse?.data ?? [];
    if (selectedRepoId === "all") {
      return all;
    }
    return all.filter((wt) => wt.repository?.id === selectedRepoId);
  }, [worktreesResponse, selectedRepoId]);

  // Get job IDs with PRs that need status fetching
  const jobIdsWithPrs = useMemo(() => {
    return worktrees
      .filter((wt): wt is typeof wt & { job: NonNullable<typeof wt.job> } => Boolean(wt.job?.prNumber))
      .map((wt) => wt.job.id);
  }, [worktrees]);

  // Fetch PR merge status for all jobs with PRs (in parallel)
  useEffect(() => {
    // Find jobs we haven't fetched yet
    const newJobIds = jobIdsWithPrs.filter((id) => !fetchedJobIds.current.has(id));

    if (newJobIds.length === 0) return;

    // Mark as fetching
    for (const id of newJobIds) {
      fetchedJobIds.current.add(id);
    }

    // Initialize loading state for new jobs
    setPrMergeStatuses((prev) => {
      const updates: Record<string, { merged: boolean; loading: boolean }> = {};
      for (const id of newJobIds) {
        updates[id] = { merged: false, loading: true };
      }
      return { ...prev, ...updates };
    });

    // Fetch all PR statuses in parallel
    Promise.all(
      newJobIds.map(async (jobId) => {
        try {
          const status = await fetchPrMergeStatus(jobId);
          return { jobId, merged: status.merged, error: false };
        } catch {
          return { jobId, merged: false, error: true };
        }
      }),
    ).then((results) => {
      setPrMergeStatuses((prev) => {
        const updates = { ...prev };
        for (const result of results) {
          updates[result.jobId] = { merged: result.merged, loading: false };
        }
        return updates;
      });
    });
  }, [jobIdsWithPrs]);

  const handleCleanup = (jobId: string) => {
    cleanupMutation.mutate(jobId, {
      onSuccess: (result) => {
        if (result.success) {
          toast.success("Workspace removed", {
            description: "The workspace and associated files have been cleaned up.",
          });
        } else {
          toast.error("Removal failed", {
            description: result.error || "An unknown error occurred",
          });
        }
      },
      onError: (error) => {
        toast.error("Removal failed", { description: error.message });
      },
    });
  };

  // Orphaned worktree cleanup (no job ID, use worktree path)
  const handleCleanupOrphaned = (_worktreePath: string) => {
    // For orphaned worktrees, we'll need to handle this differently
    // For now, show a toast explaining the situation
    toast("Orphaned workspace", {
      description: "This workspace can be manually removed from the file system.",
    });
    // Refetch to update the list
    refetch();
  };

  if (isLoading) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex-1 p-6">
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholders
              <Skeleton key={i} className="h-48 w-full rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex h-full flex-col items-center justify-center p-8 text-center">
          <div className="mb-4 rounded-full bg-red-100 dark:bg-red-900/30 p-4">
            <AlertCircle className="h-10 w-10 text-red-600 dark:text-red-400" />
          </div>
          <h2 className="mb-2 text-xl font-semibold">Failed to load workspaces</h2>
          <p className="mb-6 max-w-md text-muted-foreground">
            {error instanceof Error ? error.message : "An unknown error occurred"}
          </p>
          <div className="flex items-center gap-3">
            <Button onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
            <Button variant="outline" asChild>
              <Link href="/">Back to Dashboard</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Info bar */}
      <div className="flex h-12 items-center gap-1 border-b bg-background px-4">
        <span className="text-sm text-muted-foreground">
          {worktrees.length} workspace{worktrees.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {worktrees.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center p-8 text-center">
            <div className="mb-4 rounded-full bg-muted/50 p-4">
              <Inbox className="h-10 w-10 text-muted-foreground/70" />
            </div>
            <h2 className="mb-2 text-xl font-semibold">All clear</h2>
            <p className="mb-6 max-w-md text-muted-foreground">
              Workspaces appear here when agents start working on issues. Each job gets its own isolated workspace.
            </p>
            <Button asChild>
              <Link href="/">Back to Dashboard</Link>
            </Button>
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="p-6 space-y-6">
              {/* Dismissible info alert */}
              {!infoDismissed && (
                <div className="rounded-xl border border-blue-200/50 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-950/20 p-4 relative">
                  <button
                    type="button"
                    onClick={dismissInfo}
                    className="absolute right-3 top-3 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  <div className="flex gap-3">
                    <Lightbulb className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                    <div className="pr-6">
                      <h4 className="text-sm font-medium mb-1">What are workspaces?</h4>
                      <p className="text-sm text-muted-foreground">
                        Each job gets its own workspace—an isolated copy of your repo where the agent makes changes.
                        After your PR is merged, the workspace is automatically cleaned up.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Workspaces grid */}
              <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                {worktrees.map((worktree) => {
                  const jobId = worktree.job?.id;
                  const prStatus = jobId ? prMergeStatuses[jobId] : undefined;

                  return (
                    <WorktreeCard
                      key={worktree.path}
                      worktree={worktree}
                      prMerged={prStatus?.merged}
                      prMergeLoading={prStatus?.loading}
                      onCleanup={handleCleanup}
                      onCleanupOrphaned={handleCleanupOrphaned}
                      cleanupLoading={cleanupMutation.isPending && cleanupMutation.variables === jobId}
                    />
                  );
                })}
              </div>
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
