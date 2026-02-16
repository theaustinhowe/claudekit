"use client";

import { formatDistanceToNow } from "date-fns";
import {
  Check,
  ClipboardCopy,
  Code,
  ExternalLink,
  FileDiff,
  GitBranch,
  GitFork,
  GitPullRequest,
  Loader2,
  Trash2,
} from "lucide-react";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { WorktreeInfo } from "@/lib/api";
import type { JobStatus } from "@/types/job";
import { JOB_STATUS_CONFIG } from "@/types/job";
import { ChangesDrawer } from "./changes-drawer";

interface WorktreeCardProps {
  worktree: WorktreeInfo;
  prMerged?: boolean;
  prMergeLoading?: boolean;
  onCleanup?: (jobId: string) => void;
  onCleanupOrphaned?: (worktreePath: string) => void;
  cleanupLoading?: boolean;
}

export function WorktreeCard({
  worktree,
  prMerged = false,
  prMergeLoading = false,
  onCleanup,
  onCleanupOrphaned,
  cleanupLoading = false,
}: WorktreeCardProps) {
  const [copied, setCopied] = useState(false);
  const [changesDrawerOpen, setChangesDrawerOpen] = useState(false);
  const { job } = worktree;

  const statusConfig = job ? JOB_STATUS_CONFIG[job.status as JobStatus] : null;

  // Determine if cleanup is allowed
  const isCompletedStatus = job?.status === "done" || job?.status === "failed";
  const hasPr = !!job?.prNumber;
  const canCleanup = isCompletedStatus && (!hasPr || prMerged);

  // Get cleanup disabled reason
  const getCleanupDisabledReason = (): string | null => {
    if (!job) return "No associated job";
    if (!isCompletedStatus) return `Job status is "${job.status}" - must be "done" or "failed"`;
    if (hasPr && prMergeLoading) return "Checking PR merge status...";
    if (hasPr && !prMerged) return "PR is not merged yet";
    return null;
  };

  const cleanupDisabledReason = getCleanupDisabledReason();

  const handleCopyBranch = async () => {
    await navigator.clipboard.writeText(worktree.branch);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenInVSCode = () => {
    window.location.href = `vscode://file/${worktree.path}`;
  };

  // Truncate path for display
  const truncatePath = (path: string, maxLength = 40): string => {
    if (path.length <= maxLength) return path;
    return `...${path.slice(-maxLength + 3)}`;
  };

  // For orphaned worktrees, show a different title
  const isOrphaned = !job;

  return (
    <TooltipProvider>
      <Card className="shadow-sm transition-all hover:shadow-md border-border/50 rounded-xl">
        <CardContent className="p-5">
          {/* Header: Job info + status */}
          <div className="mb-4 flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              {/* Repository indicator */}
              {worktree.repository && (
                <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <GitFork className="h-3 w-3" />
                  <span className="truncate">
                    {worktree.repository.displayName || `${worktree.repository.owner}/${worktree.repository.name}`}
                  </span>
                </div>
              )}
              <div className="mb-1.5 flex items-center gap-2">
                {job ? (
                  <>
                    <span className="text-sm font-medium text-muted-foreground">#{job.issueNumber}</span>
                    {statusConfig && (
                      <Badge className={`${statusConfig.bgColor} ${statusConfig.color} border-0`}>
                        {statusConfig.label}
                      </Badge>
                    )}
                  </>
                ) : (
                  <span className="text-sm text-muted-foreground">No linked job</span>
                )}
              </div>
              {job ? (
                <h3 className="truncate text-sm font-semibold">{job.issueTitle}</h3>
              ) : (
                <h3 className="truncate text-sm font-semibold text-muted-foreground">{worktree.branch}</h3>
              )}
            </div>
            {/* PR indicator */}
            {job?.prNumber && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <a
                    href={job.prUrl ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <GitPullRequest className="h-3.5 w-3.5" />
                    <span>#{job.prNumber}</span>
                    {prMergeLoading ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : prMerged ? (
                      <Check className="h-3 w-3 text-emerald-500" />
                    ) : null}
                  </a>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">
                    {prMergeLoading ? "Checking merge status..." : prMerged ? "PR merged" : "PR not merged"}
                  </p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>

          {/* Branch and path info */}
          <div className="mb-4 space-y-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <GitBranch className="h-3 w-3 flex-shrink-0" />
              <span className="truncate font-mono">{worktree.branch}</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-5 w-5 hover:bg-muted/50" onClick={handleCopyBranch}>
                    {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <ClipboardCopy className="h-3 w-3" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{copied ? "Copied!" : "Copy branch name"}</TooltipContent>
              </Tooltip>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <p className="cursor-default truncate font-mono">{truncatePath(worktree.path)}</p>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-md">
                <p className="break-all font-mono text-xs">{worktree.path}</p>
              </TooltipContent>
            </Tooltip>
            {job?.updatedAt && (
              <p>
                Updated{" "}
                {formatDistanceToNow(new Date(job.updatedAt), {
                  addSuffix: true,
                })}
              </p>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 hover:bg-muted/50" onClick={handleOpenInVSCode}>
                  <Code className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">VS Code</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Open in VS Code</p>
              </TooltipContent>
            </Tooltip>

            {/* Only show Changes button if PR is not merged */}
            {!prMerged && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 hover:bg-muted/50"
                    onClick={() => setChangesDrawerOpen(true)}
                  >
                    <FileDiff className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Changes</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">View file changes</p>
                </TooltipContent>
              </Tooltip>
            )}

            <div className="flex-1" />

            {/* Cleanup button for orphaned worktrees */}
            {isOrphaned && onCleanupOrphaned && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    disabled={cleanupLoading}
                  >
                    {cleanupLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                    <span className="hidden sm:inline">Remove</span>
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove workspace</AlertDialogTitle>
                    <AlertDialogDescription>
                      This workspace has no linked job and is safe to remove.
                      <span className="mt-2 block font-mono text-xs">{worktree.path}</span>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => onCleanupOrphaned(worktree.path)}>Remove</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}

            {/* Cleanup button for jobs */}
            {job &&
              onCleanup &&
              (canCleanup ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      disabled={cleanupLoading}
                    >
                      {cleanupLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                      <span className="hidden sm:inline">Remove</span>
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remove workspace</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently remove the workspace and associated files for job #{job.issueNumber}.
                        <span className="mt-2 block font-mono text-xs">{worktree.path}</span>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => onCleanup(job.id)}>Remove</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 pointer-events-none opacity-50"
                      aria-disabled="true"
                      tabIndex={0}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Remove</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">{cleanupDisabledReason}</p>
                  </TooltipContent>
                </Tooltip>
              ))}

            {/* External link to GitHub issue */}
            {job && worktree.repository && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" className="hover:bg-muted/50" asChild>
                    <a
                      href={`https://github.com/${worktree.repository.owner}/${worktree.repository.name}/issues/${job.issueNumber}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>View on GitHub</TooltipContent>
              </Tooltip>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Changes drawer */}
      <ChangesDrawer
        jobId={job?.id}
        worktreePath={worktree.path}
        title={job ? `Changes in #${job.issueNumber}: ${job.issueTitle}` : `Changes in ${worktree.branch}`}
        open={changesDrawerOpen}
        onOpenChange={setChangesDrawerOpen}
      />
    </TooltipProvider>
  );
}
