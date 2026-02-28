"use client";

import { formatNumber } from "@claudekit/ui";
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
} from "@claudekit/ui/components/alert-dialog";
import { Badge } from "@claudekit/ui/components/badge";
import { Button } from "@claudekit/ui/components/button";
import { ScrollArea } from "@claudekit/ui/components/scroll-area";
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from "@claudekit/ui/components/sheet";
import { Skeleton } from "@claudekit/ui/components/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@claudekit/ui/components/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@claudekit/ui/components/tooltip";
import { format, formatDistanceStrict } from "date-fns";
import {
  AlertTriangle,
  Bot,
  ChevronDown,
  ChevronUp,
  Clock,
  Code2,
  Copy,
  FileDiff,
  FileText,
  GitBranch,
  GitPullRequest,
  History,
  Loader2,
  MessageSquare,
  Pause,
  Play,
  RefreshCcw,
  RefreshCw,
  StopCircle,
  Terminal,
  TestTube2,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { IssueComments, IssueDescription } from "@/components/issues/issue-content";
import { useCheckNeedsInfoResponse, useCreatePr, useJob, useJobAction, useJobEvents } from "@/hooks/use-jobs";
import type { JobActionType } from "@/lib/api";
import { JOB_STATUS_CONFIG } from "@/types/job";
import { ActivitySummary } from "./activity-summary";
import { FailedJobPanel } from "./failed-job-panel";
import { InjectModal } from "./inject-modal";
import { JobTimeline } from "./job-timeline";
import { LogPreview } from "./log-preview";
import { LogViewer } from "./log-viewer";
import { NeedsInfoPanel } from "./needs-info-panel";
import { PausedJobPanel } from "./paused-job-panel";
import { PlanApprovalPanel } from "./plan-approval-panel";
import { PrOpenedPanel } from "./pr-opened-panel";
import { PrReviewingPanel } from "./pr-reviewing-panel";
import { ReadyToPrPanel } from "./ready-to-pr-panel";

interface JobAhead {
  id: string;
  issueNumber: number;
  issueTitle: string;
}

/**
 * Generate a contextual quick summary based on job state
 */
function getQuickSummary(job: {
  status: string;
  testRetryCount: number;
  changeSummary: string | null;
  prUrl: string | null;
  pauseReason: string | null;
  needsInfoQuestion: string | null;
}): string | null {
  switch (job.status) {
    case "planning":
      return "Agent is analyzing the issue and creating an implementation plan.";

    case "awaiting_plan_approval":
      return "Implementation plan ready for review.";

    case "running":
      return "Agent is working autonomously.";

    case "queued":
      return "Waiting in queue to start.";

    case "needs_info":
      return "Waiting for human response to continue.";

    case "paused":
      if (job.pauseReason?.toLowerCase().includes("orchestrator")) {
        return "Paused due to orchestrator restart.";
      }
      return "Job is paused.";

    case "ready_to_pr": {
      const parts = ["Testing changes"];
      if (job.testRetryCount > 0) {
        parts.push(`(attempt ${job.testRetryCount + 1})`);
      }
      return `${parts.join(" ")}.`;
    }

    case "pr_opened":
      return "Pull request created. Awaiting review.";

    case "pr_reviewing":
      return "Monitoring PR for review comments.";

    case "failed":
      return "Job failed. Retry to continue.";

    case "done":
      return "Job completed successfully.";

    default:
      return null;
  }
}

interface JobDetailDrawerProps {
  jobId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  queuePosition?: number;
  jobsAhead?: JobAhead[];
}

export function JobDetailDrawer({ jobId, open, onOpenChange, queuePosition, jobsAhead }: JobDetailDrawerProps) {
  const [failureExpanded, setFailureExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const { data: job, isLoading: jobLoading } = useJob(jobId);
  const { data: events = [], isFetching: eventsFetching, refetch: refetchEvents } = useJobEvents(jobId);
  const { mutate: performAction, isPending: actionPending } = useJobAction();
  const { mutate: triggerCreatePr, isPending: createPrPending } = useCreatePr();
  const { mutate: checkResponse, isPending: checkResponsePending } = useCheckNeedsInfoResponse();

  if (!jobId) return null;

  const handleCopyBranch = () => {
    if (job?.branch) {
      navigator.clipboard.writeText(job.branch);
      toast.success("Copied!", {
        description: "Branch name copied to clipboard",
      });
    }
  };

  const doJobAction = (
    actionType: JobActionType,
    successTitle: string,
    failVerb: string,
    successDescription?: string,
  ) => {
    if (!job) return;
    performAction(
      { jobId: job.id, action: { type: actionType } },
      {
        onSuccess: () =>
          toast.success(successTitle, successDescription ? { description: successDescription } : undefined),
        onError: (err) => toast.error(`Failed to ${failVerb}`, { description: err.message }),
      },
    );
  };

  const handlePause = () => doJobAction("pause", "Job Paused", "pause");
  const handleResume = () => doJobAction("resume", "Job Resumed", "resume");
  const handleCancel = () => doJobAction("cancel", "Job Cancelled", "cancel");
  const handleForceStop = () => doJobAction("force_stop", "Job Force Stopped", "force stop");
  const handleRetry = () =>
    doJobAction("retry", "Job Retrying", "retry", "The job has been queued for another attempt.");
  // Loading state
  if (jobLoading) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-xl flex flex-col p-0">
          <SheetHeader className="p-6 pb-4 border-b">
            <Skeleton className="h-6 w-24 mb-2" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-6 w-48 mt-3" />
          </SheetHeader>
          <div className="p-4 space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  if (!job) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-xl flex flex-col p-0">
          <SheetHeader className="p-6 pb-4 border-b">
            <SheetTitle>Job not found</SheetTitle>
          </SheetHeader>
        </SheetContent>
      </Sheet>
    );
  }

  const config = JOB_STATUS_CONFIG[job.status];
  const isPaused = job.status === "paused";
  const isRunning = job.status === "running";
  const isPlanning = job.status === "planning";
  const isAwaitingPlanApproval = job.status === "awaiting_plan_approval";
  const isFailed = job.status === "failed";
  const canPauseResume = isRunning || isPaused || isPlanning;
  const canCancel = ["running", "planning", "awaiting_plan_approval", "queued", "paused"].includes(job.status);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl flex flex-col p-0">
        <SheetHeader className="p-6 pb-4 border-b">
          {/* Header Section */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                {job.issueNumber < 0 ? (
                  <Badge variant="outline" className="text-xs">
                    Manual Job
                  </Badge>
                ) : (
                  <span className="text-sm font-medium text-muted-foreground">#{job.issueNumber}</span>
                )}
                <Badge variant="secondary" className={`${config.bgColor} ${config.color} border-0`}>
                  {config.label}
                </Badge>
                {job.status === "queued" && queuePosition !== undefined && (
                  <Badge variant="outline" className="text-xs">
                    #{queuePosition} in queue
                  </Badge>
                )}
                {/* Agent type badge */}
                {job.agentType && (
                  <Badge
                    variant="outline"
                    className={`text-xs gap-1 ${
                      job.agentType === "mock"
                        ? "border-gray-400/50 text-gray-600 dark:text-gray-400"
                        : "border-orange-500/50 text-orange-600 dark:text-orange-400"
                    }`}
                  >
                    {job.agentType === "mock" ? <TestTube2 className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
                    {job.agentType === "mock" ? "Mock" : "Claude"}
                  </Badge>
                )}
              </div>
              <SheetTitle className="text-left leading-snug">{job.issueTitle}</SheetTitle>
              {/* Quick Summary */}
              {getQuickSummary(job) && (
                <p className="text-sm text-muted-foreground mt-1">
                  {getQuickSummary(job)}
                  {job.changeSummary && (
                    <span className="ml-1">
                      {(() => {
                        // Count files from change summary
                        const lines = job.changeSummary.split("\n").filter(Boolean);
                        const fileCount = lines.length;
                        return fileCount > 0
                          ? `${formatNumber(fileCount)} file${fileCount > 1 ? "s" : ""} modified.`
                          : "";
                      })()}
                    </span>
                  )}
                  {job.testRetryCount > 0 && job.status === "ready_to_pr" && (
                    <span className="ml-1 text-orange-600 dark:text-orange-400">Attempt {job.testRetryCount + 1}.</span>
                  )}
                </p>
              )}
            </div>
          </div>

          {/* Branch name */}
          {job.branch && (
            <div className="flex items-center gap-2 mt-3 text-sm">
              <GitBranch className="h-4 w-4 text-muted-foreground" />
              <code className="flex-1 truncate bg-muted px-2 py-1 rounded text-xs">{job.branch}</code>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleCopyBranch}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Copy branch name</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          )}

          {/* PR Link if available */}
          {job.prUrl && (
            <a
              href={job.prUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 mt-2 text-sm text-primary hover:underline"
            >
              <GitPullRequest className="h-4 w-4" />
              View Pull Request
            </a>
          )}

          {/* Failure Reason - surfaced near status badge for visibility */}
          {job.failureReason && (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setFailureExpanded(!failureExpanded)}
                className="flex items-center gap-2 w-full text-left px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 hover:bg-red-100 dark:hover:bg-red-950/50 transition-colors"
              >
                <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0" />
                <span className={`text-sm text-red-700 dark:text-red-300 flex-1 ${failureExpanded ? "" : "truncate"}`}>
                  {job.failureReason}
                </span>
                {job.failureReason.length > 60 &&
                  (failureExpanded ? (
                    <ChevronUp className="h-4 w-4 text-red-500 shrink-0" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-red-500 shrink-0" />
                  ))}
              </button>
            </div>
          )}
        </SheetHeader>

        <SheetBody>
          {/* Controls Bar - Two rows */}
          <div className="p-4 border-b bg-muted/30 space-y-2">
            {/* Row 1: Action buttons (state-changing) */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Retry for failed jobs */}
              {isFailed && (
                <Button variant="default" size="sm" onClick={handleRetry} disabled={actionPending}>
                  <RefreshCcw className="h-4 w-4 mr-1" />
                  {actionPending ? "Retrying..." : "Retry"}
                </Button>
              )}

              {/* Pause/Resume */}
              {canPauseResume && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={isPaused ? handleResume : handlePause}
                  disabled={actionPending}
                >
                  {isPaused ? (
                    <>
                      <Play className="h-4 w-4 mr-1" />
                      Resume
                    </>
                  ) : (
                    <>
                      <Pause className="h-4 w-4 mr-1" />
                      Pause
                    </>
                  )}
                </Button>
              )}

              {/* Abort Job (formerly Cancel) - marks as failed (terminal) */}
              {canCancel && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" disabled={actionPending}>
                      <XCircle className="h-4 w-4 mr-1" />
                      Abort Job
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Abort this job?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will stop the agent and mark the job as <strong>permanently failed</strong>. Any work in
                        progress will be lost and cannot be recovered. If you just want to pause the agent, use "Stop &
                        Pause" instead.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep Running</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleCancel}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Abort Job
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}

              {/* Guide Agent - Prominent inject for running or planning jobs */}
              {(isRunning || isPlanning) && <InjectModal jobId={job.id} disabled={actionPending} variant="prominent" />}

              {/* Stop & Pause (formerly Force Stop) - terminates process but job stays paused (resumable) */}
              {(isRunning || isPlanning) && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm" disabled={actionPending}>
                      <StopCircle className="h-4 w-4 mr-1" />
                      Stop & Pause
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Stop and pause this job?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will immediately terminate the agent process. The job will be <strong>paused</strong> and
                        you can resume it later, but the session will not be saved so the agent will start fresh. Use
                        this when the agent is doing something wrong and you want to stop it quickly.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep Running</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleForceStop}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Stop & Pause
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>

            {/* Row 2: Utility buttons (persistent tools) */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Open in VS Code */}
              {job.worktreePath && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (job.worktreePath) {
                      window.open(`vscode://file/${encodeURIComponent(job.worktreePath)}`, "_blank");
                    }
                  }}
                >
                  <Code2 className="h-4 w-4 mr-1" />
                  VS Code
                </Button>
              )}

              {/* Inject Message - only show in row 2 when not running/planning (those have Guide Agent in row 1) */}
              {!isRunning && !isPlanning && <InjectModal jobId={job.id} disabled={actionPending} />}

              {/* Mark Failed - for paused jobs */}
              {isPaused && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" disabled={actionPending}>
                      <XCircle className="h-4 w-4 mr-1" />
                      Mark Failed
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Mark this job as failed?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently mark the job as failed. Any work in progress will be preserved in the
                        worktree, but the agent will stop working on this job.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep Paused</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleCancel}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Mark as Failed
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>

          {/* Tabbed Content */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
            <div className="px-4 pt-2 border-b">
              <TabsList className="w-full justify-start h-9 bg-transparent p-0 gap-4">
                <TabsTrigger
                  value="overview"
                  className="data-[selected]:bg-transparent data-[selected]:shadow-none border-b-2 border-transparent data-[selected]:border-primary rounded-none px-1 pb-2"
                >
                  <FileText className="h-4 w-4 mr-1.5" />
                  Overview
                </TabsTrigger>
                <TabsTrigger
                  value="issue"
                  className="data-[selected]:bg-transparent data-[selected]:shadow-none border-b-2 border-transparent data-[selected]:border-primary rounded-none px-1 pb-2"
                >
                  <MessageSquare className="h-4 w-4 mr-1.5" />
                  Issue
                </TabsTrigger>
                <TabsTrigger
                  value="logs"
                  className="data-[selected]:bg-transparent data-[selected]:shadow-none border-b-2 border-transparent data-[selected]:border-primary rounded-none px-1 pb-2"
                >
                  <Terminal className="h-4 w-4 mr-1.5" />
                  Logs
                </TabsTrigger>
                <TabsTrigger
                  value="history"
                  className="data-[selected]:bg-transparent data-[selected]:shadow-none border-b-2 border-transparent data-[selected]:border-primary rounded-none px-1 pb-2"
                >
                  <History className="h-4 w-4 mr-1.5" />
                  History
                  {eventsFetching && <Loader2 className="h-3 w-3 ml-1 animate-spin" />}
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Overview Tab */}
            <TabsContent value="overview" className="flex-1 m-0 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="p-4 pb-8 space-y-4">
                  {/* Activity Summary - shows what agent is currently doing */}
                  <ActivitySummary jobId={job.id} isRunning={isRunning || isPlanning} />

                  {/* Log Preview - shows recent output for running/planning jobs */}
                  {(isRunning || isPlanning) && <LogPreview jobId={job.id} maxLines={5} />}

                  {/* Changes so far - shows what files the agent has modified */}
                  {job.changeSummary && (
                    <div className="rounded-lg border bg-muted/30 p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <FileDiff className="h-4 w-4 text-muted-foreground" />
                        <p className="text-sm font-medium">Changes so far</p>
                        <span className="text-xs text-muted-foreground">
                          ({job.changeSummary.split("\n").filter(Boolean).length} files)
                        </span>
                      </div>
                      <div className="bg-white dark:bg-gray-900 rounded-md p-3 text-xs border font-mono whitespace-pre-wrap max-h-32 overflow-y-auto">
                        {job.changeSummary}
                      </div>
                    </div>
                  )}

                  {/* Job Timeline - compact progress visualization */}
                  {events.length > 0 && (
                    <JobTimeline events={events} createdAt={job.createdAt} currentStatus={job.status} />
                  )}

                  {/* Queue Preview - shows jobs ahead when queued with explanation */}
                  {job.status === "queued" && (
                    <div className="rounded-lg border bg-muted/30 p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <p className="text-sm font-medium">Waiting in Queue</p>
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">
                        {jobsAhead && jobsAhead.length > 0
                          ? `${jobsAhead.length} job${jobsAhead.length > 1 ? "s" : ""} ahead. Jobs are processed first-in, first-out.`
                          : "This job is next in line and will start when a slot becomes available."}
                      </p>
                      {jobsAhead && jobsAhead.length > 0 && (
                        <ul className="space-y-1.5 mt-3 pt-3 border-t">
                          {jobsAhead.slice(0, 3).map((j) => (
                            <li key={j.id} className="text-sm flex items-center gap-2">
                              <span className="font-medium text-muted-foreground">#{j.issueNumber}</span>
                              <span className="truncate">{j.issueTitle}</span>
                            </li>
                          ))}
                          {jobsAhead.length > 3 && (
                            <li className="text-xs text-muted-foreground">+{jobsAhead.length - 3} more</li>
                          )}
                        </ul>
                      )}
                    </div>
                  )}

                  {/* Planning indicator - shows when agent is creating a plan */}
                  {isPlanning && (
                    <div className="rounded-lg border bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-900 p-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
                        <p className="text-sm font-medium text-indigo-700 dark:text-indigo-400">
                          Agent is analyzing the codebase and creating an implementation plan...
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Plan Approval Panel - shows when plan is ready for review */}
                  {isAwaitingPlanApproval && (
                    <PlanApprovalPanel
                      jobId={job.id}
                      planContent={job.planContent}
                      issueUrl={job.issueUrl}
                      source={job.source}
                      lastCheckedAt={job.updatedAt}
                    />
                  )}

                  {/* Needs Info Panel - shows when job is waiting for human response */}
                  {job.status === "needs_info" && (
                    <NeedsInfoPanel
                      jobId={job.id}
                      question={job.needsInfoQuestion}
                      issueUrl={job.issueUrl}
                      latestResponse={(() => {
                        const evt = events.find((e) => e.eventType === "needs_info_response");
                        if (!evt) return null;
                        const meta = evt.metadata as {
                          githubUser?: string;
                          githubCommentUrl?: string;
                        } | null;
                        return {
                          message: evt.message || "",
                          user: meta?.githubUser,
                          url: meta?.githubCommentUrl,
                        };
                      })()}
                      pollInterval={30000}
                      lastCheckedAt={job.updatedAt}
                      onRefresh={() => {
                        checkResponse(job.id, {
                          onSuccess: (result) => {
                            if (result.responseFound) {
                              toast.success("Response Found", {
                                description: "Job has resumed automatically.",
                              });
                            } else {
                              toast("No Response Yet", {
                                description: "No new response found. The job will check again automatically.",
                              });
                            }
                          },
                          onError: (err) => {
                            toast.error("Check Failed", {
                              description: err.message,
                            });
                          },
                        });
                      }}
                      isRefreshing={checkResponsePending}
                    />
                  )}

                  {/* Paused Job Panel - shows actions when job is paused */}
                  {job.status === "paused" && <PausedJobPanel job={job} />}

                  {/* Failed Job Panel - shows retry options */}
                  {job.status === "failed" && <FailedJobPanel job={job} />}

                  {/* Ready to PR Panel - shows when job is ready for PR creation */}
                  {job.status === "ready_to_pr" && (
                    <ReadyToPrPanel
                      job={job}
                      onCreatePr={() => {
                        triggerCreatePr(job.id, {
                          onSuccess: (result) => {
                            if (result.success) {
                              toast.success("PR Created", {
                                description: "Pull request created successfully",
                              });
                            } else if (result.retriedToRunning) {
                              toast.error("Tests Failed", {
                                description: result.message || "Job returned to running for agent to fix",
                              });
                            } else {
                              toast.error("Failed to create PR", {
                                description: result.error,
                              });
                            }
                          },
                          onError: (err) => {
                            toast.error("Failed to create PR", {
                              description: err.message,
                            });
                          },
                        });
                      }}
                      isPending={createPrPending}
                    />
                  )}

                  {/* PR Opened Panel - shows guidance after PR is created */}
                  {job.status === "pr_opened" && <PrOpenedPanel job={job} />}

                  {/* PR Reviewing Panel - shows when agent is monitoring for reviews */}
                  {job.status === "pr_reviewing" && <PrReviewingPanel job={job} />}
                </div>
              </ScrollArea>
            </TabsContent>

            {/* Logs Tab */}
            <TabsContent value="logs" className="flex-1 m-0 overflow-hidden p-4">
              <LogViewer jobId={job.id} isActive={isRunning} />
            </TabsContent>

            {/* History Tab */}
            <TabsContent value="history" className="flex-1 m-0 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="p-4 pb-8">
                  {/* Header with refresh button */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-medium">Event History</h3>
                      <span className="text-xs text-muted-foreground">
                        ({formatNumber(events.length)} {events.length === 1 ? "event" : "events"})
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        Total:{" "}
                        {job.createdAt && !Number.isNaN(new Date(job.createdAt).getTime())
                          ? formatDistanceStrict(new Date(job.createdAt), new Date())
                          : "—"}
                      </span>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => refetchEvents()}
                              disabled={eventsFetching}
                              className="h-7 px-2"
                            >
                              <RefreshCw className={`h-3.5 w-3.5 ${eventsFetching ? "animate-spin" : ""}`} />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Refresh events</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>

                  {/* Events list */}
                  {events.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">No events yet</p>
                  ) : (
                    <div className="space-y-1">
                      {events.map((event, index) => {
                        // Calculate duration from previous event
                        const prevEvent = events[index + 1]; // events are in desc order
                        const duration = prevEvent
                          ? formatDistanceStrict(new Date(prevEvent.createdAt), new Date(event.createdAt))
                          : null;

                        const isStateChange = event.eventType === "state_change";
                        const isRunStart =
                          isStateChange && (event.toStatus === "running" || event.toStatus === "queued");

                        return (
                          <div key={event.id}>
                            {/* Add visual separator before new runs */}
                            {isRunStart && index < events.length - 1 && (
                              <div className="flex items-center gap-2 my-3 py-1">
                                <div className="flex-1 h-px bg-border" />
                                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                                  {event.toStatus === "running" ? "Run Started" : "New Job"}
                                </span>
                                <div className="flex-1 h-px bg-border" />
                              </div>
                            )}
                            <div
                              className={`flex items-start gap-2 text-sm pl-3 py-1.5 rounded-sm ${
                                isStateChange ? "border-l-2 border-primary/50 bg-muted/30" : "border-l-2 border-muted"
                              }`}
                            >
                              <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                                {format(new Date(event.createdAt), "MMM d, HH:mm:ss")}
                              </span>
                              <span className={`flex-1 ${isStateChange ? "font-medium" : ""}`}>
                                {isStateChange && event.fromStatus && event.toStatus
                                  ? `${event.fromStatus} → ${event.toStatus}`
                                  : event.message || event.eventType}
                              </span>
                              {duration && <span className="text-xs text-muted-foreground shrink-0">+{duration}</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            {/* Issue Tab */}
            <TabsContent value="issue" className="flex-1 m-0 overflow-hidden">
              <TooltipProvider>
                <ScrollArea className="h-full">
                  <div className="p-4 pb-8 space-y-4">
                    {/* Description */}
                    <IssueDescription body={job.issueBody} />

                    {/* Comments Section - hidden for manual jobs */}
                    {job.repositoryId && job.issueNumber > 0 && (
                      <IssueComments
                        repositoryId={job.repositoryId}
                        issueNumber={job.issueNumber}
                        issueUrl={job.issueUrl}
                      />
                    )}
                  </div>
                </ScrollArea>
              </TooltipProvider>
            </TabsContent>
          </Tabs>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
