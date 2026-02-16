"use client";

import { useIsMobile } from "@devkit/hooks";
import { Badge } from "@devkit/ui/components/badge";
import { Button } from "@devkit/ui/components/button";
import { Card, CardContent } from "@devkit/ui/components/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@devkit/ui/components/tooltip";
import { formatDistanceStrict, formatDistanceToNow } from "date-fns";
import {
  Activity,
  Bot,
  CheckCircle2,
  Clock,
  Code2,
  GitPullRequest,
  GitPullRequestDraft,
  HelpCircle,
  Loader2,
  MessageSquare,
  Pause,
  PauseCircle,
  Play,
  Sparkles,
  TestTube2,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { RepoBadge } from "@/components/repo/repo-badge";
import { useJobAction, useJobLogs } from "@/hooks/use-jobs";
import type { Job } from "@/types/job";
import { JOB_STATUS_CONFIG } from "@/types/job";
import { extractActivitySummary } from "./activity-summary";

/**
 * Estimate wait time based on queue position.
 * Uses a heuristic of ~15 minutes per job ahead in queue.
 * Assumes some parallelism (divides by 2 for typical 2-3 agent setup).
 */
function formatEstimatedWait(queuePosition: number): string {
  // Heuristic: ~15 min per job, with some parallelism
  const avgMinutesPerJob = 15;
  const parallelismFactor = 2; // Assume 2 agents on average
  const estimatedMinutes = Math.ceil((queuePosition * avgMinutesPerJob) / parallelismFactor);

  if (estimatedMinutes < 60) {
    return `${estimatedMinutes}m`;
  }
  const hours = Math.floor(estimatedMinutes / 60);
  const mins = estimatedMinutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

interface JobCardProps {
  job: Job;
  onClick: (job: Job) => void;
  queuePosition?: number;
}

/**
 * Inline activity preview for running jobs - shows what the agent is currently doing
 */
function InlineActivityPreview({ jobId }: { jobId: string }) {
  const { data: logs = [] } = useJobLogs(jobId);
  const summary = useMemo(() => extractActivitySummary(logs), [logs]);

  if (!summary) return null;

  // Get time since last log
  const lastLog = logs[logs.length - 1];
  const lastTime = lastLog?.createdAt ? formatDistanceToNow(new Date(lastLog.createdAt), { addSuffix: false }) : null;

  return (
    <div className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 mt-2 px-0.5">
      <Activity className="h-3 w-3 shrink-0" />
      <span className="truncate">{summary}</span>
      {lastTime && <span className="text-muted-foreground shrink-0">• {lastTime}</span>}
    </div>
  );
}

const STATUS_ICON_MAP: Record<string, { icon: typeof Clock; spin?: boolean }> = {
  queued: { icon: Clock },
  running: { icon: Loader2, spin: true },
  planning: { icon: Loader2, spin: true },
  awaiting_plan_approval: { icon: HelpCircle },
  needs_info: { icon: HelpCircle },
  ready_to_pr: { icon: GitPullRequestDraft },
  pr_opened: { icon: GitPullRequest },
  pr_reviewing: { icon: MessageSquare },
  done: { icon: CheckCircle2 },
  failed: { icon: XCircle },
  paused: { icon: PauseCircle },
};

const StatusIcon = ({ status }: { status: Job["status"] }) => {
  const entry = STATUS_ICON_MAP[status];
  if (!entry) return null;
  const Icon = entry.icon;
  const label = JOB_STATUS_CONFIG[status]?.label ?? status;
  return (
    <span title={label}>
      <Icon className={`h-4 w-4${entry.spin ? " animate-spin" : ""}`} aria-hidden="true" />
    </span>
  );
};

export function JobCard({ job, onClick, queuePosition }: JobCardProps) {
  const config = JOB_STATUS_CONFIG[job.status];
  const isMobile = useIsMobile();
  const [isHovered, setIsHovered] = useState(false);
  const { mutate: performAction, isPending: actionPending } = useJobAction();

  const createdDate = new Date(job.createdAt);
  const timeAgo = Number.isNaN(createdDate.getTime())
    ? "unknown"
    : formatDistanceToNow(createdDate, { addSuffix: true });
  // State-aware elapsed time: show how long in current state, not just creation time
  const updatedDate = job.updatedAt ? new Date(job.updatedAt) : null;
  const stateElapsed =
    updatedDate && !Number.isNaN(updatedDate.getTime()) ? formatDistanceStrict(updatedDate, new Date()) : null;
  const isQueued = job.status === "queued";
  const isRunning = job.status === "running";
  const isPaused = job.status === "paused";
  const isNeedsInfo = job.status === "needs_info";
  const isFailed = job.status === "failed";
  const canPause = isRunning;
  const canResume = isPaused;
  const hasWorktree = Boolean(job.worktreePath);

  const handlePause = (e: React.MouseEvent) => {
    e.stopPropagation();
    performAction(
      { jobId: job.id, action: { type: "pause" } },
      {
        onSuccess: () => toast.success("Job Paused"),
        onError: (err) => toast.error("Failed to pause", { description: err.message }),
      },
    );
  };

  const handleResume = (e: React.MouseEvent) => {
    e.stopPropagation();
    performAction(
      { jobId: job.id, action: { type: "resume" } },
      {
        onSuccess: () => toast.success("Job Resumed"),
        onError: (err) => toast.error("Failed to resume", { description: err.message }),
      },
    );
  };

  const handleOpenVSCode = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (job.worktreePath) {
      window.open(`vscode://file/${encodeURIComponent(job.worktreePath)}`, "_blank");
    }
  };

  return (
    <Card
      className={`cursor-pointer transition-all duration-base hover:shadow-elevation-2 hover:-translate-y-0.5 hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 relative group ${isNeedsInfo ? "border-orange-300 dark:border-orange-800" : ""}`}
      tabIndex={0}
      role="button"
      aria-label={`Job #${job.issueNumber}: ${job.issueTitle} — ${config.label}`}
      onClick={() => onClick(job)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick(job);
        }
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Quick actions overlay - desktop only */}
      {!isMobile && isHovered && (
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1 bg-background/95 rounded-md border shadow-sm p-1">
          <TooltipProvider delayDuration={0}>
            {canPause && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={handlePause}
                    disabled={actionPending}
                  >
                    <Pause className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Pause job</TooltipContent>
              </Tooltip>
            )}
            {canResume && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={handleResume}
                    disabled={actionPending}
                  >
                    <Play className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Resume job</TooltipContent>
              </Tooltip>
            )}
            {hasWorktree && (isRunning || isPaused) && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleOpenVSCode}>
                    <Code2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Open in VS Code</TooltipContent>
              </Tooltip>
            )}
          </TooltipProvider>
        </div>
      )}

      <CardContent className="p-4">
        {/* Issue number, repo badge, and status badge */}
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {job.issueNumber < 0 ? (
              <Badge variant="outline" className="text-xs px-1.5 py-0">
                Manual
              </Badge>
            ) : (
              <span className="text-sm font-medium text-muted-foreground">#{job.issueNumber}</span>
            )}
            <TooltipProvider>
              <RepoBadge repositoryId={job.repositoryId} />
            </TooltipProvider>
          </div>
          <Badge variant="secondary" className={`${config.bgColor} ${config.color} gap-1 border-0`}>
            <StatusIcon status={job.status} />
            {config.label}
          </Badge>
        </div>

        {/* Title */}
        <h3 className="text-sm font-medium leading-snug line-clamp-2">{job.issueTitle}</h3>

        {/* Inline activity preview for running jobs */}
        {isRunning && <InlineActivityPreview jobId={job.id} />}

        {/* Needs info question preview */}
        {isNeedsInfo && job.needsInfoQuestion && (
          <div className="flex items-start gap-1.5 text-xs text-orange-600 dark:text-orange-400 mt-2 px-0.5">
            <span className="relative flex h-2 w-2 mt-1 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-orange-500" />
            </span>
            <span className="line-clamp-2">{job.needsInfoQuestion}</span>
          </div>
        )}

        {/* Failure reason preview */}
        {isFailed && job.failureReason && (
          <div className="flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400 mt-2 px-0.5">
            <XCircle className="h-3 w-3 shrink-0 mt-0.5" />
            <span className="line-clamp-1">{job.failureReason}</span>
          </div>
        )}

        {/* Time elapsed, agent type, and queue position */}
        <div
          className={`flex items-center justify-between text-xs text-muted-foreground ${isRunning || isNeedsInfo || isFailed ? "mt-2" : "mt-3"}`}
        >
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <Clock className="h-3 w-3" />
              {/* State-aware time: show how long in current state for active states */}
              {isRunning && stateElapsed ? (
                <span>running for {stateElapsed}</span>
              ) : isPaused && stateElapsed ? (
                <span>paused for {stateElapsed}</span>
              ) : isNeedsInfo && stateElapsed ? (
                <span>waiting for {stateElapsed}</span>
              ) : (
                <span>{timeAgo}</span>
              )}
            </div>
            {/* Agent type indicator */}
            {job.agentType && (
              <div
                className="flex items-center gap-1"
                title={
                  job.agentType === "openai-codex"
                    ? "OpenAI Codex"
                    : job.agentType === "mock"
                      ? "Mock Agent (Dev)"
                      : "Claude Code"
                }
              >
                {job.agentType === "openai-codex" ? (
                  <Sparkles className="h-3 w-3 text-emerald-500" />
                ) : job.agentType === "mock" ? (
                  <TestTube2 className="h-3 w-3 text-gray-500" />
                ) : (
                  <Bot className="h-3 w-3 text-orange-500" />
                )}
              </div>
            )}
          </div>
          {isQueued && queuePosition !== undefined && (
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="font-medium text-muted-foreground cursor-default">
                    #{queuePosition} in queue
                    {queuePosition > 0 && (
                      <span className="ml-1 text-muted-foreground/70">(~{formatEstimatedWait(queuePosition)})</span>
                    )}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">
                    Estimated wait based on queue position.
                    <br />
                    Actual time depends on job complexity.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
