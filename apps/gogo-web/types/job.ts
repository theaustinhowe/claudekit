// Re-export core types and constants from shared package (source of truth)
export type { Job } from "@claudekit/gogo-shared";

// Import JobStatus as a value for use in constants
import type { JobStatus as JobStatusType } from "@claudekit/gogo-shared";
export type JobStatus = JobStatusType;

export const JOB_STATUS_CONFIG: Record<
  JobStatus,
  {
    label: string;
    color: string;
    bgColor: string;
    icon: string;
  }
> = {
  queued: {
    label: "Queued",
    color: "text-muted-foreground",
    bgColor: "bg-muted",
    icon: "clock",
  },
  planning: {
    label: "Planning",
    color: "text-indigo-600 dark:text-indigo-400",
    bgColor: "bg-indigo-100 dark:bg-indigo-900/30",
    icon: "brain",
  },
  awaiting_plan_approval: {
    label: "Plan Review",
    color: "text-amber-600 dark:text-amber-400",
    bgColor: "bg-amber-100 dark:bg-amber-900/30",
    icon: "clipboard-check",
  },
  running: {
    label: "Running",
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-100 dark:bg-blue-900/30",
    icon: "loader",
  },
  needs_info: {
    label: "Needs Info",
    color: "text-orange-600 dark:text-orange-400",
    bgColor: "bg-orange-100 dark:bg-orange-900/30",
    icon: "help-circle",
  },
  ready_to_pr: {
    label: "Testing & PR",
    color: "text-purple-600 dark:text-purple-400",
    bgColor: "bg-purple-100 dark:bg-purple-900/30",
    icon: "git-pull-request-draft",
  },
  pr_opened: {
    label: "PR Opened",
    color: "text-green-600 dark:text-green-400",
    bgColor: "bg-green-100 dark:bg-green-900/30",
    icon: "git-pull-request",
  },
  pr_reviewing: {
    label: "Reviewing",
    color: "text-cyan-600 dark:text-cyan-400",
    bgColor: "bg-cyan-100 dark:bg-cyan-900/30",
    icon: "message-square",
  },
  paused: {
    label: "Paused",
    color: "text-yellow-600 dark:text-yellow-400",
    bgColor: "bg-yellow-100 dark:bg-yellow-900/30",
    icon: "pause-circle",
  },
  done: {
    label: "Done",
    color: "text-emerald-600 dark:text-emerald-400",
    bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
    icon: "check-circle",
  },
  failed: {
    label: "Failed",
    color: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-100 dark:bg-red-900/30",
    icon: "x-circle",
  },
};

// Grouped columns for simplified kanban view
export interface ColumnGroup {
  id: string;
  label: string;
  statuses: JobStatus[];
  color: string;
  bgColor: string;
}

export const COLUMN_GROUPS: ColumnGroup[] = [
  {
    id: "queued",
    label: "Queued",
    statuses: ["queued"],
    color: "text-muted-foreground",
    bgColor: "bg-muted",
  },
  {
    id: "active",
    label: "Running",
    statuses: ["planning", "running"],
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-100 dark:bg-blue-900/30",
  },
  {
    id: "attention",
    label: "Needs Attention",
    statuses: ["needs_info", "paused", "failed"],
    color: "text-orange-600 dark:text-orange-400",
    bgColor: "bg-orange-100 dark:bg-orange-900/30",
  },
  {
    id: "pr",
    label: "Pull Request",
    statuses: ["awaiting_plan_approval", "ready_to_pr", "pr_opened", "pr_reviewing"],
    color: "text-purple-600 dark:text-purple-400",
    bgColor: "bg-purple-100 dark:bg-purple-900/30",
  },
  {
    id: "completed",
    label: "Completed",
    statuses: ["done"],
    color: "text-emerald-600 dark:text-emerald-400",
    bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
  },
];
