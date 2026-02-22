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
        return fn({} as never);
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
        return fn({} as never);
      });

      vi.mocked(queryOne).mockResolvedValueOnce(undefined);

      const result = await applyTransitionAtomic("nonexistent", "paused", "Test");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Job not found");
    });

    it("should return error for invalid transition", async () => {
      const mockJob = { id: "job-1", status: "done" };

      vi.mocked(withTransaction).mockImplementation(async (_conn, fn) => {
        return fn({} as never);
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
        return fn({} as never);
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
        return fn({} as never);
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
        return fn({} as never);
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
        return fn({} as never);
      });

      vi.mocked(queryOne).mockResolvedValueOnce(mockJob).mockResolvedValueOnce(mockUpdatedJob);

      vi.mocked(execute).mockResolvedValue(undefined);
      // buildUpdate may return null for empty updates (no status change, no other fields)
      vi.mocked(buildUpdate).mockReturnValue(null as unknown as ReturnType<typeof buildUpdate>);

      const result = await applyActionAtomic("job-1", "inject", {
        message: "Additional instructions",
      });

      expect(result.success).toBe(true);
    });

    it("should store metadata in event", async () => {
      const mockJob = { id: "job-1", status: "running" };
      const mockUpdatedJob = { id: "job-1", status: "paused" };

      vi.mocked(withTransaction).mockImplementation(async (_conn, fn) => {
        return fn({} as never);
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
      const params = eventInsertCall?.[2] as unknown[];
      const metadataParam = params.find((p) => typeof p === "string" && p.includes("customKey"));
      expect(metadataParam).toBeDefined();
    });
  });
});
