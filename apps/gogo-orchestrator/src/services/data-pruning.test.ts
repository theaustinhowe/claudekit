import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/index.js", () => ({
  getConn: vi.fn(() => ({})),
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
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      // All three calls to getOldTerminalJobIds return no jobs
      vi.mocked(queryAll).mockResolvedValue([]);

      await runDataPruning();

      expect(consoleSpy).toHaveBeenCalledWith("[data-pruning] No old data to prune");
      consoleSpy.mockRestore();
    });

    it("should prune logs for old terminal jobs", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
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

      consoleSpy.mockRestore();
    });

    it("should query for terminal statuses (done, failed)", async () => {
      vi.spyOn(console, "log").mockImplementation(() => {});

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
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
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

      consoleSpy.mockRestore();
    });

    it("should handle errors gracefully", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      vi.spyOn(console, "log").mockImplementation(() => {});

      vi.mocked(queryAll).mockRejectedValue(new Error("DB connection failed"));

      await runDataPruning();

      expect(consoleErrorSpy).toHaveBeenCalledWith("[data-pruning] Failed to prune data:", expect.any(Error));

      consoleErrorSpy.mockRestore();
    });

    it("should log completion summary when data was pruned", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      vi.mocked(queryAll)
        .mockResolvedValueOnce([{ id: "job-1" }]) // pruneOldLogs
        .mockResolvedValueOnce([{ id: "log-1" }, { id: "log-2" }]) // log count for job-1
        .mockResolvedValueOnce([]) // pruneOldEvents
        .mockResolvedValueOnce([]); // pruneArchivedJobs

      await runDataPruning();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Complete: 2 logs, 0 events, 0 jobs pruned"));

      consoleSpy.mockRestore();
    });
  });
});
