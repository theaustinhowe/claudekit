import { describe, expect, it } from "vitest";
import { ARCHIVABLE_STATUSES, JOB_STATUS_LABELS, VALID_TRANSITIONS } from "./constants";
import type { JobStatus } from "./types";

// ---------------------------------------------------------------------------
// VALID_TRANSITIONS
// ---------------------------------------------------------------------------

describe("VALID_TRANSITIONS", () => {
  const ALL_STATUSES: JobStatus[] = [
    "queued",
    "planning",
    "awaiting_plan_approval",
    "running",
    "needs_info",
    "ready_to_pr",
    "pr_opened",
    "pr_reviewing",
    "paused",
    "failed",
    "done",
  ];

  it("has an entry for every JobStatus", () => {
    for (const status of ALL_STATUSES) {
      expect(VALID_TRANSITIONS).toHaveProperty(status);
      expect(Array.isArray(VALID_TRANSITIONS[status])).toBe(true);
    }
  });

  it("has no extra keys beyond the known statuses", () => {
    expect(Object.keys(VALID_TRANSITIONS).sort()).toEqual([...ALL_STATUSES].sort());
  });

  it("'done' is a terminal state with no transitions", () => {
    expect(VALID_TRANSITIONS.done).toEqual([]);
  });

  it("'failed' can only transition back to 'queued'", () => {
    expect(VALID_TRANSITIONS.failed).toEqual(["queued"]);
  });

  it("'queued' can transition to planning, paused, or failed", () => {
    expect(VALID_TRANSITIONS.queued).toEqual(["planning", "paused", "failed"]);
  });

  it("'running' can reach needs_info, ready_to_pr, paused, or failed", () => {
    expect(VALID_TRANSITIONS.running).toEqual(["needs_info", "ready_to_pr", "paused", "failed"]);
  });

  it("'planning' can reach awaiting_plan_approval, needs_info, paused, or failed", () => {
    expect(VALID_TRANSITIONS.planning).toEqual(["awaiting_plan_approval", "needs_info", "paused", "failed"]);
  });

  it("'awaiting_plan_approval' can reach running, planning, paused, or failed", () => {
    expect(VALID_TRANSITIONS.awaiting_plan_approval).toEqual(["running", "planning", "paused", "failed"]);
  });

  it("'needs_info' can reach running, paused, or failed", () => {
    expect(VALID_TRANSITIONS.needs_info).toEqual(["running", "paused", "failed"]);
  });

  it("'ready_to_pr' can reach pr_opened, running, paused, or failed", () => {
    expect(VALID_TRANSITIONS.ready_to_pr).toEqual(["pr_opened", "running", "paused", "failed"]);
  });

  it("'pr_opened' can reach pr_reviewing, done, paused, or failed", () => {
    expect(VALID_TRANSITIONS.pr_opened).toEqual(["pr_reviewing", "done", "paused", "failed"]);
  });

  it("'pr_reviewing' can reach running, done, paused, or failed", () => {
    expect(VALID_TRANSITIONS.pr_reviewing).toEqual(["running", "done", "paused", "failed"]);
  });

  it("'paused' can reach running, queued, planning, or failed", () => {
    expect(VALID_TRANSITIONS.paused).toEqual(["running", "queued", "planning", "failed"]);
  });

  it("every transition target is a valid JobStatus", () => {
    for (const [_, targets] of Object.entries(VALID_TRANSITIONS)) {
      for (const target of targets) {
        expect(ALL_STATUSES).toContain(target);
      }
    }
  });

  it("all non-terminal statuses can transition to 'failed'", () => {
    const nonTerminal = ALL_STATUSES.filter((s) => s !== "done" && s !== "failed");
    for (const status of nonTerminal) {
      expect(VALID_TRANSITIONS[status]).toContain("failed");
    }
  });
});

// ---------------------------------------------------------------------------
// ARCHIVABLE_STATUSES
// ---------------------------------------------------------------------------

describe("ARCHIVABLE_STATUSES", () => {
  it("contains exactly done, failed, and paused", () => {
    expect([...ARCHIVABLE_STATUSES].sort()).toEqual(["done", "failed", "paused"].sort());
  });

  it("has three entries", () => {
    expect(ARCHIVABLE_STATUSES).toHaveLength(3);
  });

  it("does not include active statuses like 'running' or 'queued'", () => {
    expect(ARCHIVABLE_STATUSES).not.toContain("running");
    expect(ARCHIVABLE_STATUSES).not.toContain("queued");
    expect(ARCHIVABLE_STATUSES).not.toContain("planning");
  });
});

// ---------------------------------------------------------------------------
// JOB_STATUS_LABELS
// ---------------------------------------------------------------------------

describe("JOB_STATUS_LABELS", () => {
  const ALL_STATUSES: JobStatus[] = [
    "queued",
    "planning",
    "awaiting_plan_approval",
    "running",
    "needs_info",
    "ready_to_pr",
    "pr_opened",
    "pr_reviewing",
    "paused",
    "failed",
    "done",
  ];

  it("has a label for every JobStatus", () => {
    for (const status of ALL_STATUSES) {
      expect(JOB_STATUS_LABELS[status]).toBeDefined();
      expect(typeof JOB_STATUS_LABELS[status]).toBe("string");
      expect(JOB_STATUS_LABELS[status].length).toBeGreaterThan(0);
    }
  });

  it("has no extra keys", () => {
    expect(Object.keys(JOB_STATUS_LABELS).sort()).toEqual([...ALL_STATUSES].sort());
  });

  it("maps specific statuses to expected labels", () => {
    expect(JOB_STATUS_LABELS.queued).toBe("Queued");
    expect(JOB_STATUS_LABELS.planning).toBe("Planning");
    expect(JOB_STATUS_LABELS.awaiting_plan_approval).toBe("Plan Review");
    expect(JOB_STATUS_LABELS.running).toBe("Running");
    expect(JOB_STATUS_LABELS.needs_info).toBe("Needs Info");
    expect(JOB_STATUS_LABELS.ready_to_pr).toBe("Testing & PR");
    expect(JOB_STATUS_LABELS.pr_opened).toBe("PR Opened");
    expect(JOB_STATUS_LABELS.pr_reviewing).toBe("Reviewing");
    expect(JOB_STATUS_LABELS.paused).toBe("Paused");
    expect(JOB_STATUS_LABELS.done).toBe("Done");
    expect(JOB_STATUS_LABELS.failed).toBe("Failed");
  });
});
