import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/index.js", () => ({
  getDb: vi.fn(async () => ({})),
}));

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("../utils/logger.js", () => ({
  createServiceLogger: () => mockLogger,
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

import { execute, queryAll } from "@devkit/duckdb";
import { runDataPruning } from "./data-pruning.js";

describe("data-pruning", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(execute).mockResolvedValue(undefined);
  });

  describe("runDataPruning", () => {
    it("should log 'no old data' when nothing to prune", async () => {
      // All three calls to getOldTerminalJobIds return no jobs
      vi.mocked(queryAll).mockResolvedValue([]);

      await runDataPruning();

      expect(mockLogger.info).toHaveBeenCalledWith("No old data to prune");
    });

    it("should prune logs for old terminal jobs", async () => {
      const oldJobs = [{ id: "job-old-1" }, { id: "job-old-2" }];

      // getOldTerminalJobIds for logs (14 days), returns old jobs
      vi.mocked(queryAll)
        .mockResolvedValueOnce(oldJobs) // pruneOldLogs -> getOldTerminalJobIds
        .mockResolvedValueOnce([{ id: "log-1" }, { id: "log-2" }]) // logs for job-old-1
        .mockResolvedValueOnce([{ id: "log-3" }]) // logs for job-old-2
        .mockResolvedValueOnce(oldJobs) // pruneOldEvents -> getOldTerminalJobIds
        .mockResolvedValueOnce([{ id: "evt-1" }]) // events for job-old-1
        .mockResolvedValueOnce([]) // events for job-old-2
        .mockResolvedValueOnce([]); // pruneArchivedJobs -> getOldTerminalJobIds (90 days, none)

      await runDataPruning();

      // Verify delete queries for logs
      const executeCalls = vi.mocked(execute).mock.calls;
      const logDeletes = executeCalls.filter(
        (call) => typeof call[1] === "string" && call[1].includes("DELETE FROM job_logs"),
      );
      expect(logDeletes).toHaveLength(2);
    });

    it("should query for terminal statuses (done, failed)", async () => {
      vi.mocked(queryAll).mockResolvedValue([]);

      await runDataPruning();

      // First queryAll call is getOldTerminalJobIds
      expect(queryAll).toHaveBeenCalledWith(
        expect.anything(),
        "SELECT id FROM jobs WHERE updated_at < ? AND status IN (?, ?)",
        expect.arrayContaining(["done", "failed"]),
      );
    });

    it("should prune archived jobs (logs, events, then job records)", async () => {
      const archivedJobs = [{ id: "archived-1" }];

      vi.mocked(queryAll)
        .mockResolvedValueOnce([]) // pruneOldLogs -> getOldTerminalJobIds (14 days)
        .mockResolvedValueOnce([]) // pruneOldEvents -> getOldTerminalJobIds (14 days)
        .mockResolvedValueOnce(archivedJobs); // pruneArchivedJobs -> getOldTerminalJobIds (90 days)

      await runDataPruning();

      const executeCalls = vi.mocked(execute).mock.calls;

      // Should delete logs, events, then job record
      expect(executeCalls).toHaveLength(3);
      expect(executeCalls[0][1]).toContain("DELETE FROM job_logs");
      expect(executeCalls[1][1]).toContain("DELETE FROM job_events");
      expect(executeCalls[2][1]).toContain("DELETE FROM jobs");
    });

    it("should handle errors gracefully", async () => {
      vi.mocked(queryAll).mockRejectedValue(new Error("DB connection failed"));

      await runDataPruning();

      expect(mockLogger.error).toHaveBeenCalledWith({ err: expect.any(Error) }, "Failed to prune data");
    });

    it("should log completion summary when data was pruned", async () => {
      vi.mocked(queryAll)
        .mockResolvedValueOnce([{ id: "job-1" }]) // pruneOldLogs
        .mockResolvedValueOnce([{ id: "log-1" }, { id: "log-2" }]) // log count for job-1
        .mockResolvedValueOnce([]) // pruneOldEvents
        .mockResolvedValueOnce([]); // pruneArchivedJobs

      await runDataPruning();

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ logs: 2, events: 0, archivedJobs: 0 }),
        "Data pruning complete",
      );
    });
  });
});
