import type { JobStatus } from "@claudekit/gogo-shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyAction,
  applyActionAtomic,
  applyTransitionAtomic,
  canTransition,
  validateTransition,
} from "./state-machine.js";

// Mock the database and WebSocket broadcast
vi.mock("../db/index.js", () => ({
  getDb: vi.fn(async () => ({})),
}));

vi.mock("@claudekit/duckdb", () => ({
  queryAll: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
  withTransaction: vi.fn(),
  buildUpdate: vi.fn(),
  buildWhere: vi.fn(),
  buildInClause: vi.fn(),
  checkpoint: vi.fn(),
}));

vi.mock("../ws/handler.js", () => ({
  broadcast: vi.fn(),
}));

import { buildUpdate, execute, queryOne, withTransaction } from "@claudekit/duckdb";
import { cast } from "@claudekit/test-utils";
import { broadcast } from "../ws/handler.js";

describe("state-machine", () => {
  describe("canTransition", () => {
    it("should allow valid transitions from running", () => {
      expect(canTransition("running", "paused")).toBe(true);
      expect(canTransition("running", "failed")).toBe(true);
      expect(canTransition("running", "needs_info")).toBe(true);
      expect(canTransition("running", "ready_to_pr")).toBe(true);
    });

    it("should not allow invalid transitions", () => {
      expect(canTransition("running", "queued")).toBe(false);
      expect(canTransition("done", "running")).toBe(false);
    });
  });

  describe("validateTransition", () => {
    it("should return valid for allowed transitions", () => {
      const result = validateTransition("running", "paused");
      expect(result.valid).toBe(true);
      expect(result.eventType).toBe("state_change");
    });

    it("should return error for same state", () => {
      const result = validateTransition("running", "running");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Job is already in running state");
    });

    it("should return error for invalid transition", () => {
      const result = validateTransition("done", "running");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Cannot transition from done to running");
    });
  });

  describe("applyAction - force_stop", () => {
    it("should transition running job to paused", () => {
      const result = applyAction("running", "force_stop");
      expect(result.newStatus).toBe("paused");
      expect(result.error).toBeUndefined();
      expect(result.updates.pause_reason).toBe("Stopped by user");
    });

    it("should reject force_stop on non-running job", () => {
      const statuses: JobStatus[] = [
        "queued",
        "paused",
        "failed",
        "done",
        "needs_info",
        "ready_to_pr",
        "pr_opened",
        "pr_reviewing",
      ];
      for (const status of statuses) {
        const result = applyAction(status, "force_stop");
        expect(result.newStatus).toBeNull();
        expect(result.error).toBe("Can only force stop a running or planning job");
      }
    });

    it("should use custom reason when provided", () => {
      const result = applyAction("running", "force_stop", {
        reason: "Emergency stop",
      });
      expect(result.updates.pause_reason).toBe("Emergency stop");
    });
  });

  describe("applyAction - pause", () => {
    it("should transition running job to paused", () => {
      const result = applyAction("running", "pause");
      expect(result.newStatus).toBe("paused");
      expect(result.updates.pause_reason).toBe("User requested pause");
    });

    it("should reject pause on already paused job", () => {
      const result = applyAction("paused", "pause");
      expect(result.newStatus).toBeNull();
      expect(result.error).toBe("Job is already paused");
    });
  });

  describe("applyAction - resume", () => {
    it("should transition paused job to queued", () => {
      const result = applyAction("paused", "resume");
      expect(result.newStatus).toBe("queued");
      expect(result.updates.pause_reason).toBeNull();
    });

    it("should reject resume on non-paused job", () => {
      const result = applyAction("running", "resume");
      expect(result.newStatus).toBeNull();
      expect(result.error).toBe("Can only resume a paused job");
    });
  });

  describe("applyAction - cancel", () => {
    it("should transition running job to failed", () => {
      const result = applyAction("running", "cancel");
      expect(result.newStatus).toBe("failed");
      expect(result.updates.failure_reason).toBe("Cancelled by user");
    });

    it("should reject cancel on done job", () => {
      const result = applyAction("done", "cancel");
      expect(result.newStatus).toBeNull();
      expect(result.error).toBe("Cannot cancel a completed job");
    });
  });

  describe("applyAction - retry", () => {
    it("should transition failed job to queued", () => {
      const result = applyAction("failed", "retry");
      expect(result.newStatus).toBe("queued");
      expect(result.updates.failure_reason).toBeNull();
    });

    it("should reject retry on non-failed job", () => {
      const result = applyAction("running", "retry");
      expect(result.newStatus).toBeNull();
      expect(result.error).toBe("Can only retry a failed job");
    });
  });

  describe("applyAction - resume_with_agent", () => {
    it("should transition paused job to running", () => {
      const result = applyAction("paused", "resume_with_agent");
      expect(result.newStatus).toBe("running");
      expect(result.eventType).toBe("user_action");
      expect(result.updates.pause_reason).toBeNull();
      expect(result.updates.needs_info_question).toBeNull();
      expect(result.error).toBeUndefined();
    });

    it("should transition needs_info job to running", () => {
      const result = applyAction("needs_info", "resume_with_agent");
      expect(result.newStatus).toBe("running");
      expect(result.eventType).toBe("user_action");
      expect(result.updates.pause_reason).toBeNull();
      expect(result.updates.needs_info_question).toBeNull();
      expect(result.error).toBeUndefined();
    });

    it("should reject resume_with_agent on running job", () => {
      const result = applyAction("running", "resume_with_agent");
      expect(result.newStatus).toBeNull();
      expect(result.error).toContain("Can only resume with agent from paused or needs_info state");
    });

    it("should reject resume_with_agent on queued job", () => {
      const result = applyAction("queued", "resume_with_agent");
      expect(result.newStatus).toBeNull();
      expect(result.error).toContain("Can only resume with agent from paused or needs_info state");
    });

    it("should reject resume_with_agent on done job", () => {
      const result = applyAction("done", "resume_with_agent");
      expect(result.newStatus).toBeNull();
      expect(result.error).toContain("Can only resume with agent from paused or needs_info state");
    });

    it("should reject resume_with_agent on failed job", () => {
      const result = applyAction("failed", "resume_with_agent");
      expect(result.newStatus).toBeNull();
      expect(result.error).toContain("Can only resume with agent from paused or needs_info state");
    });
  });

  describe("applyTransitionAtomic", () => {
    beforeEach(() => {
      vi.resetAllMocks();
    });

    it("should perform valid transition atomically", async () => {
      const mockJob = { id: "job-1", status: "running" };
      const mockUpdatedJob = { id: "job-1", status: "paused" };

      // Mock withTransaction to execute callback
      vi.mocked(withTransaction).mockImplementation(async (_conn, fn) => {
        return fn(cast({}));
      });

      // queryOne: first for current job, second for re-read after update
      vi.mocked(queryOne).mockResolvedValueOnce(mockJob).mockResolvedValueOnce(mockUpdatedJob);

      vi.mocked(execute).mockResolvedValue(undefined);
      vi.mocked(buildUpdate).mockReturnValue({
        sql: "UPDATE jobs SET status = ? WHERE id = ?",
        params: ["paused", "job-1"],
      });

      const result = await applyTransitionAtomic("job-1", "paused", "Test transition");

      expect(result.success).toBe(true);
      expect(result.job).toEqual(mockUpdatedJob);
      expect(broadcast).toHaveBeenCalledWith({
        type: "job:updated",
        payload: mockUpdatedJob,
      });
    });

    it("should return error for job not found", async () => {
      vi.mocked(withTransaction).mockImplementation(async (_conn, fn) => {
        return fn(cast({}));
      });

      vi.mocked(queryOne).mockResolvedValueOnce(undefined);

      const result = await applyTransitionAtomic("nonexistent", "paused", "Test");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Job not found");
    });

    it("should return error for invalid transition", async () => {
      const mockJob = { id: "job-1", status: "done" };

      vi.mocked(withTransaction).mockImplementation(async (_conn, fn) => {
        return fn(cast({}));
      });

      vi.mocked(queryOne).mockResolvedValueOnce(mockJob);

      const result = await applyTransitionAtomic("job-1", "running", "Invalid transition");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Cannot transition from done to running");
    });

    it("should include custom updates in transition", async () => {
      const mockJob = { id: "job-1", status: "running" };
      const mockUpdatedJob = {
        id: "job-1",
        status: "needs_info",
        needs_info_question: "What is the API key?",
      };

      vi.mocked(withTransaction).mockImplementation(async (_conn, fn) => {
        return fn(cast({}));
      });

      vi.mocked(queryOne).mockResolvedValueOnce(mockJob).mockResolvedValueOnce(mockUpdatedJob);

      vi.mocked(execute).mockResolvedValue(undefined);
      vi.mocked(buildUpdate).mockReturnValue({
        sql: "UPDATE jobs SET status = ?, needs_info_question = ? WHERE id = ?",
        params: ["needs_info", "What is the API key?", "job-1"],
      });

      await applyTransitionAtomic("job-1", "needs_info", "Need API key", {
        needs_info_question: "What is the API key?",
      });

      // buildUpdate should have been called with the merged update data
      expect(buildUpdate).toHaveBeenCalledWith(
        "jobs",
        "job-1",
        expect.objectContaining({
          status: "needs_info",
          needs_info_question: "What is the API key?",
        }),
        expect.anything(),
      );
    });
  });

  describe("applyActionAtomic", () => {
    beforeEach(() => {
      vi.resetAllMocks();
    });

    it("should perform valid action atomically", async () => {
      const mockJob = { id: "job-1", status: "running" };
      const mockUpdatedJob = { id: "job-1", status: "paused" };

      vi.mocked(withTransaction).mockImplementation(async (_conn, fn) => {
        return fn(cast({}));
      });

      vi.mocked(queryOne).mockResolvedValueOnce(mockJob).mockResolvedValueOnce(mockUpdatedJob);

      vi.mocked(execute).mockResolvedValue(undefined);
      vi.mocked(buildUpdate).mockReturnValue({
        sql: "UPDATE jobs SET status = ?, pause_reason = ? WHERE id = ?",
        params: ["paused", "User pause", "job-1"],
      });

      const result = await applyActionAtomic("job-1", "pause", {
        reason: "User pause",
      });

      expect(result.success).toBe(true);
      expect(result.job).toEqual(mockUpdatedJob);
      expect(broadcast).toHaveBeenCalledWith({
        type: "job:updated",
        payload: mockUpdatedJob,
      });
    });

    it("should return error for invalid action on state", async () => {
      const mockJob = { id: "job-1", status: "paused" };

      vi.mocked(withTransaction).mockImplementation(async (_conn, fn) => {
        return fn(cast({}));
      });

      vi.mocked(queryOne).mockResolvedValueOnce(mockJob);

      const result = await applyActionAtomic("job-1", "pause");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Job is already paused");
    });

    it("should handle inject action without status change", async () => {
      const mockJob = { id: "job-1", status: "running" };
      const mockUpdatedJob = { id: "job-1", status: "running" };

      vi.mocked(withTransaction).mockImplementation(async (_conn, fn) => {
        return fn(cast({}));
      });

      vi.mocked(queryOne).mockResolvedValueOnce(mockJob).mockResolvedValueOnce(mockUpdatedJob);

      vi.mocked(execute).mockResolvedValue(undefined);
      // buildUpdate may return null for empty updates (no status change, no other fields)
      vi.mocked(buildUpdate).mockReturnValue(null);

      const result = await applyActionAtomic("job-1", "inject", {
        message: "Additional instructions",
      });

      expect(result.success).toBe(true);
    });

    it("should store metadata in event", async () => {
      const mockJob = { id: "job-1", status: "running" };
      const mockUpdatedJob = { id: "job-1", status: "paused" };

      vi.mocked(withTransaction).mockImplementation(async (_conn, fn) => {
        return fn(cast({}));
      });

      vi.mocked(queryOne).mockResolvedValueOnce(mockJob).mockResolvedValueOnce(mockUpdatedJob);

      vi.mocked(execute).mockResolvedValue(undefined);
      vi.mocked(buildUpdate).mockReturnValue({
        sql: "UPDATE jobs SET status = ?, pause_reason = ? WHERE id = ?",
        params: ["paused", "Test pause", "job-1"],
      });

      await applyActionAtomic("job-1", "pause", { reason: "Test pause" }, { customKey: "customValue" });

      // The second execute call is the event INSERT
      // execute is called for: buildUpdate (if not null), then INSERT event
      const executeCalls = vi.mocked(execute).mock.calls;
      // Find the event INSERT call (contains metadata)
      const eventInsertCall = executeCalls.find(
        (call) => typeof call[1] === "string" && call[1].includes("job_events"),
      );
      expect(eventInsertCall).toBeDefined();
      // The metadata parameter should be the JSON-stringified metadata
      const metadataParam = eventInsertCall?.[2]?.find((p) => typeof p === "string" && p.includes("customKey"));
      expect(metadataParam).toBeDefined();
    });

    it("should return error when job not found", async () => {
      vi.mocked(withTransaction).mockImplementation(async (_conn, fn) => {
        return fn(cast({}));
      });

      vi.mocked(queryOne).mockResolvedValueOnce(undefined);

      const result = await applyActionAtomic("nonexistent", "pause");
      expect(result.success).toBe(false);
      expect(result.error).toBe("Job not found");
    });

    it("should handle force_stop action atomically", async () => {
      const mockJob = { id: "job-1", status: "running" };
      const mockUpdatedJob = { id: "job-1", status: "paused", pause_reason: "Stopped by user" };

      vi.mocked(withTransaction).mockImplementation(async (_conn, fn) => {
        return fn(cast({}));
      });

      vi.mocked(queryOne).mockResolvedValueOnce(mockJob).mockResolvedValueOnce(mockUpdatedJob);
      vi.mocked(execute).mockResolvedValue(undefined);
      vi.mocked(buildUpdate).mockReturnValue({
        sql: "UPDATE jobs SET status = ?, pause_reason = ? WHERE id = ?",
        params: ["paused", "Stopped by user", "job-1"],
      });

      const result = await applyActionAtomic("job-1", "force_stop");
      expect(result.success).toBe(true);
      expect(result.job).toEqual(mockUpdatedJob);
    });

    it("should handle retry action atomically", async () => {
      const mockJob = { id: "job-1", status: "failed" };
      const mockUpdatedJob = { id: "job-1", status: "queued", failure_reason: null };

      vi.mocked(withTransaction).mockImplementation(async (_conn, fn) => {
        return fn(cast({}));
      });

      vi.mocked(queryOne).mockResolvedValueOnce(mockJob).mockResolvedValueOnce(mockUpdatedJob);
      vi.mocked(execute).mockResolvedValue(undefined);
      vi.mocked(buildUpdate).mockReturnValue({
        sql: "UPDATE jobs SET status = ?, failure_reason = ? WHERE id = ?",
        params: ["queued", null, "job-1"],
      });

      const result = await applyActionAtomic("job-1", "retry");
      expect(result.success).toBe(true);
      expect(broadcast).toHaveBeenCalled();
    });

    it("should handle cancel action atomically", async () => {
      const mockJob = { id: "job-1", status: "running" };
      const mockUpdatedJob = { id: "job-1", status: "failed", failure_reason: "Cancelled by user" };

      vi.mocked(withTransaction).mockImplementation(async (_conn, fn) => {
        return fn(cast({}));
      });

      vi.mocked(queryOne).mockResolvedValueOnce(mockJob).mockResolvedValueOnce(mockUpdatedJob);
      vi.mocked(execute).mockResolvedValue(undefined);
      vi.mocked(buildUpdate).mockReturnValue({
        sql: "UPDATE jobs SET status = ?, failure_reason = ? WHERE id = ?",
        params: ["failed", "Cancelled by user", "job-1"],
      });

      const result = await applyActionAtomic("job-1", "cancel");
      expect(result.success).toBe(true);
      expect(result.job).toEqual(mockUpdatedJob);
    });

    it("should handle resume action atomically", async () => {
      const mockJob = { id: "job-1", status: "paused" };
      const mockUpdatedJob = { id: "job-1", status: "queued", pause_reason: null };

      vi.mocked(withTransaction).mockImplementation(async (_conn, fn) => {
        return fn(cast({}));
      });

      vi.mocked(queryOne).mockResolvedValueOnce(mockJob).mockResolvedValueOnce(mockUpdatedJob);
      vi.mocked(execute).mockResolvedValue(undefined);
      vi.mocked(buildUpdate).mockReturnValue({
        sql: "UPDATE jobs SET status = ?, pause_reason = ? WHERE id = ?",
        params: ["queued", null, "job-1"],
      });

      const result = await applyActionAtomic("job-1", "resume");
      expect(result.success).toBe(true);
    });

    it("should handle approve_plan action atomically", async () => {
      const mockJob = { id: "job-1", status: "awaiting_plan_approval" };
      const mockUpdatedJob = { id: "job-1", status: "running" };

      vi.mocked(withTransaction).mockImplementation(async (_conn, fn) => {
        return fn(cast({}));
      });

      vi.mocked(queryOne).mockResolvedValueOnce(mockJob).mockResolvedValueOnce(mockUpdatedJob);
      vi.mocked(execute).mockResolvedValue(undefined);
      vi.mocked(buildUpdate).mockReturnValue({
        sql: "UPDATE jobs SET status = ? WHERE id = ?",
        params: ["running", "job-1"],
      });

      const result = await applyActionAtomic("job-1", "approve_plan");
      expect(result.success).toBe(true);
    });

    it("should handle reject_plan action atomically", async () => {
      const mockJob = { id: "job-1", status: "awaiting_plan_approval" };
      const mockUpdatedJob = { id: "job-1", status: "planning" };

      vi.mocked(withTransaction).mockImplementation(async (_conn, fn) => {
        return fn(cast({}));
      });

      vi.mocked(queryOne).mockResolvedValueOnce(mockJob).mockResolvedValueOnce(mockUpdatedJob);
      vi.mocked(execute).mockResolvedValue(undefined);
      vi.mocked(buildUpdate).mockReturnValue({
        sql: "UPDATE jobs SET status = ? WHERE id = ?",
        params: ["planning", "job-1"],
      });

      const result = await applyActionAtomic("job-1", "reject_plan");
      expect(result.success).toBe(true);
    });

    it("should not broadcast when result has no job", async () => {
      vi.mocked(withTransaction).mockImplementation(async (_conn, fn) => {
        return fn(cast({}));
      });

      vi.mocked(queryOne).mockResolvedValueOnce(undefined);

      await applyActionAtomic("nonexistent", "pause");
      expect(broadcast).not.toHaveBeenCalled();
    });

    it("should use payload message in event when no reason", async () => {
      const mockJob = { id: "job-1", status: "running" };
      const mockUpdatedJob = { id: "job-1", status: "running" };

      vi.mocked(withTransaction).mockImplementation(async (_conn, fn) => {
        return fn(cast({}));
      });

      vi.mocked(queryOne).mockResolvedValueOnce(mockJob).mockResolvedValueOnce(mockUpdatedJob);
      vi.mocked(execute).mockResolvedValue(undefined);
      vi.mocked(buildUpdate).mockReturnValue(null);

      await applyActionAtomic("job-1", "inject", { message: "Do this now" });

      const executeCalls = vi.mocked(execute).mock.calls;
      const eventInsertCall = executeCalls.find(
        (call) => typeof call[1] === "string" && call[1].includes("job_events"),
      );
      expect(eventInsertCall).toBeDefined();
      // The message param should be "Do this now"
      expect(eventInsertCall?.[2]).toContain("Do this now");
    });
  });

  describe("applyAction - inject", () => {
    it("should allow inject on running job", () => {
      const result = applyAction("running", "inject");
      expect(result.newStatus).toBeNull();
      expect(result.eventType).toBe("user_action");
      expect(result.error).toBeUndefined();
    });

    it("should allow inject on queued job", () => {
      const result = applyAction("queued", "inject");
      expect(result.newStatus).toBeNull();
      expect(result.eventType).toBe("user_action");
      expect(result.error).toBeUndefined();
    });

    it("should reject inject on done job", () => {
      const result = applyAction("done", "inject");
      expect(result.error).toContain("Cannot inject instructions into a done job");
    });

    it("should reject inject on failed job", () => {
      const result = applyAction("failed", "inject");
      expect(result.error).toContain("Cannot inject instructions into a failed job");
    });
  });

  describe("applyAction - request_info", () => {
    it("should allow request_info from running state", () => {
      const result = applyAction("running", "request_info");
      expect(result.newStatus).toBe("needs_info");
      expect(result.eventType).toBe("state_change");
      expect(result.error).toBeUndefined();
    });

    it("should reject request_info from non-running state", () => {
      const result = applyAction("paused", "request_info");
      expect(result.error).toBe("Can only request info from a running job");
    });
  });

  describe("applyAction - approve_plan", () => {
    it("should transition from awaiting_plan_approval to running", () => {
      const result = applyAction("awaiting_plan_approval", "approve_plan");
      expect(result.newStatus).toBe("running");
      expect(result.eventType).toBe("plan_approved");
      expect(result.error).toBeUndefined();
    });

    it("should reject approve_plan from non-awaiting state", () => {
      const result = applyAction("running", "approve_plan");
      expect(result.error).toContain("Can only approve plan for a job awaiting plan approval");
    });
  });

  describe("applyAction - reject_plan", () => {
    it("should transition from awaiting_plan_approval to planning", () => {
      const result = applyAction("awaiting_plan_approval", "reject_plan");
      expect(result.newStatus).toBe("planning");
      expect(result.eventType).toBe("state_change");
      expect(result.error).toBeUndefined();
    });

    it("should reject reject_plan from non-awaiting state", () => {
      const result = applyAction("running", "reject_plan");
      expect(result.error).toContain("Can only reject plan for a job awaiting plan approval");
    });
  });

  describe("applyAction - force_stop", () => {
    it("should allow force_stop from planning state", () => {
      const result = applyAction("planning", "force_stop");
      expect(result.newStatus).toBe("paused");
      expect(result.updates.pause_reason).toBe("Stopped by user");
      expect(result.error).toBeUndefined();
    });

    it("should use custom reason for force_stop", () => {
      const result = applyAction("planning", "force_stop", { reason: "Taking too long" });
      expect(result.updates.pause_reason).toBe("Taking too long");
    });
  });

  describe("applyAction - unknown action", () => {
    it("should return error for unknown action type", () => {
      const result = applyAction("running", cast("nonexistent"));
      expect(result.error).toContain("Unknown action: nonexistent");
      expect(result.newStatus).toBeNull();
    });
  });

  describe("applyAction - pause edge cases", () => {
    it("should reject pause on done state", () => {
      const result = applyAction("done", "pause");
      expect(result.error).toContain("Cannot pause a job in done state");
    });

    it("should reject pause on failed state", () => {
      const result = applyAction("failed", "pause");
      expect(result.error).toContain("Cannot pause a job in failed state");
    });

    it("should use custom reason for pause", () => {
      const result = applyAction("running", "pause", { reason: "User went AFK" });
      expect(result.updates.pause_reason).toBe("User went AFK");
    });

    it("should allow pause on queued state", () => {
      const result = applyAction("queued", "pause");
      expect(result.newStatus).toBe("paused");
      expect(result.error).toBeUndefined();
    });

    it("should allow pause on planning state", () => {
      const result = applyAction("planning", "pause");
      expect(result.newStatus).toBe("paused");
      expect(result.error).toBeUndefined();
    });

    it("should allow pause on needs_info state", () => {
      const result = applyAction("needs_info", "pause");
      expect(result.newStatus).toBe("paused");
      expect(result.error).toBeUndefined();
    });
  });

  describe("applyAction - cancel edge cases", () => {
    it("should reject cancel on already failed job", () => {
      const result = applyAction("failed", "cancel");
      expect(result.error).toBe("Job has already failed");
    });

    it("should use custom reason for cancel", () => {
      const result = applyAction("running", "cancel", { reason: "Bad implementation" });
      expect(result.updates.failure_reason).toBe("Bad implementation");
    });

    it("should allow cancel on paused state", () => {
      const result = applyAction("paused", "cancel");
      expect(result.newStatus).toBe("failed");
      expect(result.error).toBeUndefined();
    });

    it("should allow cancel on queued state", () => {
      const result = applyAction("queued", "cancel");
      expect(result.newStatus).toBe("failed");
      expect(result.error).toBeUndefined();
    });
  });

  describe("canTransition comprehensive", () => {
    it("should allow all valid transitions from queued", () => {
      expect(canTransition("queued", "planning")).toBe(true);
      expect(canTransition("queued", "paused")).toBe(true);
      expect(canTransition("queued", "failed")).toBe(true);
    });

    it("should allow all valid transitions from planning", () => {
      expect(canTransition("planning", "awaiting_plan_approval")).toBe(true);
      expect(canTransition("planning", "needs_info")).toBe(true);
      expect(canTransition("planning", "paused")).toBe(true);
      expect(canTransition("planning", "failed")).toBe(true);
    });

    it("should allow all valid transitions from awaiting_plan_approval", () => {
      expect(canTransition("awaiting_plan_approval", "running")).toBe(true);
      expect(canTransition("awaiting_plan_approval", "planning")).toBe(true);
      expect(canTransition("awaiting_plan_approval", "paused")).toBe(true);
      expect(canTransition("awaiting_plan_approval", "failed")).toBe(true);
    });

    it("should allow all valid transitions from paused", () => {
      expect(canTransition("paused", "running")).toBe(true);
      expect(canTransition("paused", "queued")).toBe(true);
      expect(canTransition("paused", "planning")).toBe(true);
      expect(canTransition("paused", "failed")).toBe(true);
    });

    it("should allow all valid transitions from failed", () => {
      expect(canTransition("failed", "queued")).toBe(true);
    });

    it("should allow no transitions from done", () => {
      const allStatuses: JobStatus[] = [
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
      for (const status of allStatuses) {
        expect(canTransition("done", status)).toBe(false);
      }
    });

    it("should allow all valid transitions from needs_info", () => {
      expect(canTransition("needs_info", "running")).toBe(true);
      expect(canTransition("needs_info", "paused")).toBe(true);
      expect(canTransition("needs_info", "failed")).toBe(true);
    });

    it("should allow all valid transitions from ready_to_pr", () => {
      expect(canTransition("ready_to_pr", "pr_opened")).toBe(true);
      expect(canTransition("ready_to_pr", "running")).toBe(true);
      expect(canTransition("ready_to_pr", "paused")).toBe(true);
      expect(canTransition("ready_to_pr", "failed")).toBe(true);
    });

    it("should allow all valid transitions from pr_opened", () => {
      expect(canTransition("pr_opened", "pr_reviewing")).toBe(true);
      expect(canTransition("pr_opened", "done")).toBe(true);
      expect(canTransition("pr_opened", "paused")).toBe(true);
      expect(canTransition("pr_opened", "failed")).toBe(true);
    });

    it("should allow all valid transitions from pr_reviewing", () => {
      expect(canTransition("pr_reviewing", "running")).toBe(true);
      expect(canTransition("pr_reviewing", "done")).toBe(true);
      expect(canTransition("pr_reviewing", "paused")).toBe(true);
      expect(canTransition("pr_reviewing", "failed")).toBe(true);
    });
  });

  describe("validateTransition edge cases", () => {
    it("should return error for same paused state", () => {
      const result = validateTransition("paused", "paused");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Job is already in paused state");
    });

    it("should validate queued to planning", () => {
      const result = validateTransition("queued", "planning");
      expect(result.valid).toBe(true);
      expect(result.eventType).toBe("state_change");
    });

    it("should reject queued to done directly", () => {
      const result = validateTransition("queued", "done");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Cannot transition from queued to done");
    });
  });
});
