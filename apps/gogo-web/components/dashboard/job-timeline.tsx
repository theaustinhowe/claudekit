"use client";

import type { JobEvent } from "@devkit/gogo-shared";
import { formatDistanceStrict } from "date-fns";
import { CheckCircle2, Circle, Clock, Eye, GitPullRequest, Loader2, PauseCircle, XCircle } from "lucide-react";
import { useMemo } from "react";
import { cn } from "@/lib/utils";

interface JobTimelineProps {
  events: JobEvent[];
  createdAt: Date | string;
  currentStatus?: string;
  className?: string;
}

// Define the milestone states we care about for the timeline
const MILESTONE_STATES = ["queued", "running", "ready_to_pr", "pr_opened", "pr_reviewing", "done"] as const;

type MilestoneState = (typeof MILESTONE_STATES)[number];

interface Milestone {
  state: MilestoneState;
  label: string;
  icon: React.ElementType;
  reachedAt?: Date;
  duration?: string;
}

const MILESTONE_CONFIG: Record<MilestoneState, { label: string; icon: React.ElementType }> = {
  queued: { label: "Created", icon: Clock },
  running: { label: "Started", icon: Loader2 },
  ready_to_pr: { label: "Ready", icon: Circle },
  pr_opened: { label: "PR", icon: GitPullRequest },
  pr_reviewing: { label: "Review", icon: Eye },
  done: { label: "Done", icon: CheckCircle2 },
};

function getStatusIcon(state: MilestoneState, isReached: boolean, isCurrent: boolean, isActivelyRunning: boolean) {
  const config = MILESTONE_CONFIG[state];
  const Icon = config.icon;
  const baseClass = "h-4 w-4";

  if (!isReached) {
    return <Circle className={cn(baseClass, "text-muted-foreground/40")} />;
  }

  // Only show spinner if job is actually running (not paused/failed)
  if (isCurrent && state === "running" && isActivelyRunning) {
    return <Loader2 className={cn(baseClass, "text-blue-500 animate-spin")} />;
  }

  return <Icon className={cn(baseClass, isCurrent ? "text-primary" : "text-muted-foreground")} />;
}

export function JobTimeline({ events, createdAt, currentStatus, className }: JobTimelineProps) {
  const milestones = useMemo(() => {
    // Extract state transitions from events
    const stateTransitions = events
      .filter((e) => e.eventType === "state_change" && e.toStatus)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    // Build the timeline with reached states and durations
    const result: Milestone[] = [];
    let lastTime = new Date(createdAt);

    for (const state of MILESTONE_STATES) {
      const config = MILESTONE_CONFIG[state];
      const transition = stateTransitions.find((t) => t.toStatus === state);

      if (state === "queued") {
        // First milestone is always reached at creation
        result.push({
          state,
          label: config.label,
          icon: config.icon,
          reachedAt: new Date(createdAt),
        });
        continue;
      }

      if (transition) {
        const reachedAt = new Date(transition.createdAt);
        const duration = formatDistanceStrict(lastTime, reachedAt);
        result.push({
          state,
          label: config.label,
          icon: config.icon,
          reachedAt,
          duration,
        });
        lastTime = reachedAt;
      } else {
        result.push({
          state,
          label: config.label,
          icon: config.icon,
        });
      }
    }

    return result;
  }, [events, createdAt]);

  // Find the current state (last reached milestone)
  const currentMilestoneIndex = milestones.reduce((lastIndex, milestone, index) => {
    return milestone.reachedAt ? index : lastIndex;
  }, 0);

  // Check current status for failure or pause (not historical events)
  const isFailed = currentStatus === "failed";
  const isPaused = currentStatus === "paused";
  const isActivelyRunning = currentStatus === "running";

  return (
    <div className={cn("rounded-lg border bg-muted/30 p-3", className)}>
      <div className="flex items-center gap-1 mb-2">
        <h4 className="text-xs font-medium text-muted-foreground">Job Progress</h4>
        {isFailed && (
          <span className="flex items-center gap-1 text-xs text-red-500">
            <XCircle className="h-3 w-3" />
            Failed
          </span>
        )}
        {isPaused && (
          <span className="flex items-center gap-1 text-xs text-yellow-500">
            <PauseCircle className="h-3 w-3" />
            Paused
          </span>
        )}
      </div>

      <div className="flex items-center justify-between">
        {milestones.map((milestone, index) => {
          const isReached = Boolean(milestone.reachedAt);
          const isCurrent = index === currentMilestoneIndex;
          const isLast = index === milestones.length - 1;

          return (
            <div key={milestone.state} className="flex items-center flex-1">
              {/* Milestone node */}
              <div className="flex flex-col items-center gap-1">
                <div
                  className={cn(
                    "flex items-center justify-center w-8 h-8 rounded-full border-2",
                    isReached
                      ? isCurrent
                        ? "border-primary bg-primary/10"
                        : "border-muted-foreground/30 bg-muted"
                      : "border-muted-foreground/20 bg-background",
                  )}
                >
                  {getStatusIcon(milestone.state, isReached, isCurrent, isActivelyRunning)}
                </div>
                <span
                  className={cn(
                    "text-xs",
                    isReached
                      ? isCurrent
                        ? "text-foreground font-medium"
                        : "text-muted-foreground"
                      : "text-muted-foreground/50",
                  )}
                >
                  {milestone.label}
                </span>
                {milestone.duration && (
                  <span className="text-[10px] text-muted-foreground/70">+{milestone.duration}</span>
                )}
              </div>

              {/* Connector line */}
              {!isLast && (
                <div
                  className={cn(
                    "flex-1 h-0.5 mx-1",
                    index < currentMilestoneIndex ? "bg-muted-foreground/30" : "bg-muted-foreground/10",
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
