import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  sendLogToSubscribers: vi.fn(),
}));

vi.mock("../services/session-bridge.js", () => ({
  getLiveSession: vi.fn().mockReturnValue(undefined),
  emitEvent: vi.fn(),
}));

import { execute, queryOne } from "@claudekit/duckdb";
import { emitEvent, getLiveSession } from "../services/session-bridge.js";
import { broadcast, sendLogToSubscribers } from "../ws/handler.js";
import { emitLog, getRingBuffer, type LogState, shutdownLogBuffers, updateJobStatus } from "./job-logging.js";

describe("job-logging", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("emitLog", () => {
    it("should increment sequence and broadcast immediately", async () => {
      const state: LogState = { sequence: 0 };

      await emitLog("job-emit-1", "stdout", "Hello world", state);

      expect(state.sequence).toBe(1);
      expect(sendLogToSubscribers).toHaveBeenCalledWith("job-emit-1", {
        stream: "stdout",
        content: "Hello world",
        sequence: 0,
      });
    });

    it("should increment sequence for each call", async () => {
      const state: LogState = { sequence: 0 };

      await emitLog("job-seq-1", "stdout", "Line 1", state);
      await emitLog("job-seq-1", "stdout", "Line 2", state);
      await emitLog("job-seq-1", "stderr", "Error", state);

      expect(state.sequence).toBe(3);
      expect(sendLogToSubscribers).toHaveBeenCalledTimes(3);
    });

    it("should add entries to the ring buffer", async () => {
      const state: LogState = { sequence: 0 };

      await emitLog("job-ring-1", "stdout", "Line 1", state);
      await emitLog("job-ring-1", "stdout", "Line 2", state);

      const buffer = getRingBuffer("job-ring-1");
      expect(buffer).toHaveLength(2);
      expect(buffer[0].content).toBe("Line 1");
      expect(buffer[1].content).toBe("Line 2");
    });

    it("should route through session when a live session exists", async () => {
      vi.mocked(getLiveSession).mockReturnValue({
        status: "running",
        events: [],
      } as unknown as ReturnType<typeof getLiveSession>);

      const state: LogState = { sequence: 0 };

      await emitLog("job-session-1", "stdout", "Session log", state);

      expect(state.sequence).toBe(1);
      // Should route through emitEvent instead of local buffer
      expect(emitEvent).toHaveBeenCalledWith("job-session-1", {
        type: "log",
        log: "Session log",
        logType: "stdout",
      });
      // Should still broadcast to WebSocket
      expect(sendLogToSubscribers).toHaveBeenCalledWith("job-session-1", {
        stream: "stdout",
        content: "Session log",
        sequence: 0,
      });
      // Should NOT add to local ring buffer (session handles buffering)
      const buffer = getRingBuffer("job-session-1");
      expect(buffer).toHaveLength(0);

      // Reset the mock for other tests
      vi.mocked(getLiveSession).mockReturnValue(undefined);
    });

    it("should route through session when session status is pending", async () => {
      vi.mocked(getLiveSession).mockReturnValue({
        status: "pending",
        events: [],
      } as unknown as ReturnType<typeof getLiveSession>);

      const state: LogState = { sequence: 0 };

      await emitLog("job-pending-session", "stderr", "Pending log", state);

      expect(emitEvent).toHaveBeenCalledWith("job-pending-session", {
        type: "log",
        log: "Pending log",
        logType: "stderr",
      });
      expect(sendLogToSubscribers).toHaveBeenCalled();

      vi.mocked(getLiveSession).mockReturnValue(undefined);
    });

    it("should enforce ring buffer max size of 500", async () => {
      const state: LogState = { sequence: 0 };

      for (let i = 0; i < 510; i++) {
        await emitLog("job-overflow", "stdout", `Line ${i}`, state);
      }

      const buffer = getRingBuffer("job-overflow");
      expect(buffer).toHaveLength(500);
      expect(buffer[0].content).toBe("Line 10");
      expect(buffer[499].content).toBe("Line 509");
    });
  });

  describe("getRingBuffer", () => {
    it("should return empty array for unknown job", () => {
      const buffer = getRingBuffer("nonexistent-job");
      expect(buffer).toEqual([]);
    });

    it("should return entries after lastSequence", async () => {
      const state: LogState = { sequence: 0 };

      await emitLog("job-filter", "stdout", "Line 0", state);
      await emitLog("job-filter", "stdout", "Line 1", state);
      await emitLog("job-filter", "stdout", "Line 2", state);

      const filtered = getRingBuffer("job-filter", 0);
      expect(filtered).toHaveLength(2);
      expect(filtered[0].content).toBe("Line 1");
      expect(filtered[1].content).toBe("Line 2");
    });

    it("should return all entries when no lastSequence", async () => {
      const state: LogState = { sequence: 0 };

      await emitLog("job-all", "stdout", "A", state);
      await emitLog("job-all", "stdout", "B", state);

      const all = getRingBuffer("job-all");
      expect(all).toHaveLength(2);
    });

    it("should return a copy of the buffer", async () => {
      const state: LogState = { sequence: 0 };
      await emitLog("job-copy", "stdout", "test", state);

      const buf1 = getRingBuffer("job-copy");
      const buf2 = getRingBuffer("job-copy");
      expect(buf1).not.toBe(buf2);
      expect(buf1).toEqual(buf2);
    });
  });

  describe("getRingBuffer with session events", () => {
    it("should return session events when a live session has buffered events", () => {
      vi.mocked(getLiveSession).mockReturnValue({
        status: "running",
        events: [
          { log: "Session line 1", logType: "stdout" },
          { log: "Session line 2", logType: "stderr" },
          { type: "progress", progress: 50 }, // non-log event should be filtered
        ],
      } as unknown as ReturnType<typeof getLiveSession>);

      const buffer = getRingBuffer("job-session-ring");
      expect(buffer).toHaveLength(2);
      expect(buffer[0].content).toBe("Session line 1");
      expect(buffer[0].stream).toBe("stdout");
      expect(buffer[1].content).toBe("Session line 2");
      expect(buffer[1].stream).toBe("stderr");

      vi.mocked(getLiveSession).mockReturnValue(undefined);
    });

    it("should filter session events by lastSequence", () => {
      vi.mocked(getLiveSession).mockReturnValue({
        status: "running",
        events: [
          { log: "Line 0", logType: "stdout" },
          { log: "Line 1", logType: "stdout" },
          { log: "Line 2", logType: "stdout" },
        ],
      } as unknown as ReturnType<typeof getLiveSession>);

      const buffer = getRingBuffer("job-session-filter", 0);
      // Sequence is index-based (0, 1, 2), so > 0 means entries at index 1 and 2
      expect(buffer).toHaveLength(2);
      expect(buffer[0].content).toBe("Line 1");
      expect(buffer[1].content).toBe("Line 2");

      vi.mocked(getLiveSession).mockReturnValue(undefined);
    });

    it("should default logType to system when not provided in session events", () => {
      vi.mocked(getLiveSession).mockReturnValue({
        status: "running",
        events: [{ log: "System message" }],
      } as unknown as ReturnType<typeof getLiveSession>);

      const buffer = getRingBuffer("job-session-default-type");
      expect(buffer).toHaveLength(1);
      expect(buffer[0].stream).toBe("system");

      vi.mocked(getLiveSession).mockReturnValue(undefined);
    });
  });

  describe("shutdownLogBuffers", () => {
    it("should flush pending entries to DB on shutdown", async () => {
      const state: LogState = { sequence: 0 };

      await emitLog("job-shutdown", "stdout", "pending line", state);

      vi.mocked(execute).mockResolvedValue(undefined);

      await shutdownLogBuffers();

      expect(execute).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining("INSERT INTO job_logs"),
        expect.arrayContaining(["job-shutdown", "stdout", "pending line"]),
      );
    });

    it("should handle flush errors gracefully (catch block in flushAllPending)", async () => {
      const state: LogState = { sequence: 0 };

      await emitLog("job-flush-err", "stdout", "will fail", state);

      // Mock execute to throw an error during flush
      vi.mocked(execute).mockRejectedValue(new Error("DB write failed"));

      // Should not throw - error is caught and logged
      await expect(shutdownLogBuffers()).resolves.toBeUndefined();
    });
  });

  describe("updateJobStatus", () => {
    beforeEach(() => {
      vi.mocked(execute).mockResolvedValue(undefined);
    });

    it("should update job status and record event", async () => {
      const updatedJob = { id: "job-1", status: "paused" };
      vi.mocked(queryOne).mockResolvedValue(updatedJob);

      const result = await updateJobStatus("job-1", "paused", "running", "Paused by user");

      expect(result).toBe(true);
      expect(execute).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining("UPDATE jobs SET"),
        expect.arrayContaining(["paused"]),
      );
      expect(execute).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining("INSERT INTO job_events"),
        expect.arrayContaining(["job-1", "state_change", "running", "paused", "Paused by user"]),
      );
      expect(broadcast).toHaveBeenCalledWith({
        type: "job:updated",
        payload: updatedJob,
      });
    });

    it("should return false when job not found after update", async () => {
      vi.mocked(queryOne).mockResolvedValue(undefined);

      const result = await updateJobStatus("nonexistent", "paused", "running", "Test");

      expect(result).toBe(false);
    });

    it("should include additional updates in SET clause", async () => {
      const updatedJob = { id: "job-1", status: "failed" };
      vi.mocked(queryOne).mockResolvedValue(updatedJob);

      await updateJobStatus("job-1", "failed", "running", "Error occurred", {
        failure_reason: "Process crashed",
      });

      expect(execute).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining("failure_reason = ?"),
        expect.arrayContaining(["Process crashed"]),
      );
    });
  });
});
