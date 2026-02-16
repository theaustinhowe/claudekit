import type { JobStatus } from "./types";

/**
 * Valid job state transitions.
 * Source of truth — used by both orchestrator state machine and web UI.
 */
export const VALID_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  queued: ["planning", "paused", "failed"],
  planning: ["awaiting_plan_approval", "needs_info", "paused", "failed"],
  awaiting_plan_approval: ["running", "planning", "paused", "failed"],
  running: ["needs_info", "ready_to_pr", "paused", "failed"],
  needs_info: ["running", "paused", "failed"],
  ready_to_pr: ["pr_opened", "running", "paused", "failed"],
  pr_opened: ["pr_reviewing", "done", "paused", "failed"],
  pr_reviewing: ["running", "done", "paused", "failed"],
  paused: ["running", "queued", "planning", "failed"],
  failed: ["queued"],
  done: [],
};

/**
 * Job action types for the REST API.
 * Shared between web client and orchestrator.
 */
export type JobActionType =
  | "pause"
  | "resume"
  | "resume_with_agent"
  | "cancel"
  | "inject"
  | "request_info"
  | "retry"
  | "force_stop"
  | "approve_plan"
  | "reject_plan";

/**
 * Statuses that can be archived (moved to archive view).
 */
export const ARCHIVABLE_STATUSES: JobStatus[] = ["done", "failed", "paused"];

/**
 * Human-readable labels for each job status.
 */
export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  queued: "Queued",
  planning: "Planning",
  awaiting_plan_approval: "Plan Review",
  running: "Running",
  needs_info: "Needs Info",
  ready_to_pr: "Testing & PR",
  pr_opened: "PR Opened",
  pr_reviewing: "Reviewing",
  paused: "Paused",
  done: "Done",
  failed: "Failed",
};
