import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/index.js", () => ({
  getDb: vi.fn(async () => ({})),
}));

vi.mock("@devkit/duckdb", () => ({
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

import { execute, queryOne } from "@devkit/duckdb";
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
