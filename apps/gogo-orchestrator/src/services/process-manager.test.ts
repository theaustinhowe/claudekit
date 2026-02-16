import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock dependencies
vi.mock("../db/index.js", () => ({
  getConn: vi.fn(() => ({})),
}));

vi.mock("../db/helpers.js", () => ({
  queryAll: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
  withTransaction: vi.fn(),
  buildUpdate: vi.fn(),
  buildWhere: vi.fn(),
  buildInClause: vi.fn(),
  checkpoint: vi.fn(),
}));

import { execute, queryAll } from "../db/helpers.js";
import {
  cleanupOrphanedProcesses,
  clearStalePidReferences,
  findOrphanedProcesses,
  registerProcess,
  safeTerminate,
  unregisterProcess,
} from "./process-manager.js";

describe("process-manager", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.restoreAllMocks();
  });

  describe("registerProcess", () => {
    it("should store PID in the database", async () => {
      vi.mocked(execute).mockResolvedValue(undefined);

      await registerProcess("job-1", 12345);

      expect(execute).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining("UPDATE jobs SET process_pid"),
        expect.arrayContaining([12345]),
      );
    });
  });

  describe("unregisterProcess", () => {
    it("should clear PID from the database", async () => {
      vi.mocked(execute).mockResolvedValue(undefined);

      await unregisterProcess("job-1");

      expect(execute).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining("process_pid = NULL"),
        expect.anything(),
      );
    });
  });

  describe("findOrphanedProcesses", () => {
    it("should return jobs that have PIDs set", async () => {
      const startedAt = "2024-01-15T10:00:00.000Z";
      vi.mocked(queryAll).mockResolvedValue([
        { id: "job-1", process_pid: 1234, process_started_at: startedAt },
        { id: "job-2", process_pid: 5678, process_started_at: startedAt },
      ]);

      const result = await findOrphanedProcesses();

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        jobId: "job-1",
        pid: 1234,
        startedAt: new Date(startedAt),
      });
    });

    it("should return empty array when no jobs have PIDs", async () => {
      vi.mocked(queryAll).mockResolvedValue([]);

      const result = await findOrphanedProcesses();

      expect(result).toHaveLength(0);
    });

    it("should filter out jobs with null PID or startedAt", async () => {
      vi.mocked(queryAll).mockResolvedValue([
        { id: "job-1", process_pid: null, process_started_at: null },
        {
          id: "job-2",
          process_pid: 1234,
          process_started_at: new Date().toISOString(),
        },
      ]);

      const result = await findOrphanedProcesses();

      expect(result).toHaveLength(1);
      expect(result[0].jobId).toBe("job-2");
    });
  });

  describe("safeTerminate", () => {
    it("should return false if process does not exist", async () => {
      // Mock process.kill to throw (process doesn't exist)
      const killSpy = vi.spyOn(process, "kill").mockImplementation(() => {
        throw new Error("ESRCH");
      });

      const result = await safeTerminate(99999);

      expect(result).toBe(false);
      killSpy.mockRestore();
    });

    it("should send SIGTERM and return true when process exits gracefully", async () => {
      let callCount = 0;
      const killSpy = vi
        .spyOn(process, "kill")
        .mockImplementation((_pid, signal) => {
          callCount++;
          if (signal === 0 && callCount <= 1) {
            return true; // Process exists on first check
          }
          if (signal === "SIGTERM") {
            return true; // SIGTERM sent successfully
          }
          // After SIGTERM, process is gone
          throw new Error("ESRCH");
        });

      const result = await safeTerminate(1234);

      expect(result).toBe(true);
      killSpy.mockRestore();
    });

    it("should return false if SIGTERM fails", async () => {
      let callCount = 0;
      const killSpy = vi
        .spyOn(process, "kill")
        .mockImplementation((_pid, signal) => {
          callCount++;
          if (signal === 0 && callCount === 1) {
            return true; // Process exists
          }
          if (signal === "SIGTERM") {
            throw new Error("EPERM"); // Can't kill
          }
          throw new Error("ESRCH");
        });

      const result = await safeTerminate(1234);

      expect(result).toBe(false);
      killSpy.mockRestore();
    });
  });

  describe("cleanupOrphanedProcesses", () => {
    it("should find and terminate orphaned processes", async () => {
      const startedAt = new Date().toISOString();

      // findOrphanedProcesses
      vi.mocked(queryAll).mockResolvedValue([
        { id: "job-1", process_pid: 1234, process_started_at: startedAt },
      ]);

      // unregisterProcess
      vi.mocked(execute).mockResolvedValue(undefined);

      // Process doesn't exist (already dead)
      const killSpy = vi.spyOn(process, "kill").mockImplementation(() => {
        throw new Error("ESRCH");
      });

      const result = await cleanupOrphanedProcesses();

      expect(result.found).toBe(1);
      // safeTerminate returns false for dead process
      expect(result.failed).toBe(1);
      // unregisterProcess should still be called
      expect(execute).toHaveBeenCalled();

      killSpy.mockRestore();
    });

    it("should return zeros when no orphaned processes exist", async () => {
      vi.mocked(queryAll).mockResolvedValue([]);

      const result = await cleanupOrphanedProcesses();

      expect(result).toEqual({ found: 0, terminated: 0, failed: 0 });
    });
  });

  describe("clearStalePidReferences", () => {
    it("should clear PIDs for processes that no longer exist", async () => {
      vi.mocked(queryAll).mockResolvedValue([
        { id: "job-1", process_pid: 99999 },
      ]);

      vi.mocked(execute).mockResolvedValue(undefined);

      // Process doesn't exist
      const killSpy = vi.spyOn(process, "kill").mockImplementation(() => {
        throw new Error("ESRCH");
      });

      const cleared = await clearStalePidReferences();

      expect(cleared).toBe(1);
      expect(execute).toHaveBeenCalled();

      killSpy.mockRestore();
    });

    it("should not clear PIDs for processes that still exist", async () => {
      vi.mocked(queryAll).mockResolvedValue([
        { id: "job-1", process_pid: 1234 },
      ]);

      // Process exists
      const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);

      const cleared = await clearStalePidReferences();

      expect(cleared).toBe(0);
      expect(execute).not.toHaveBeenCalled();

      killSpy.mockRestore();
    });

    it("should return 0 when no jobs have PIDs", async () => {
      vi.mocked(queryAll).mockResolvedValue([]);

      const cleared = await clearStalePidReferences();

      expect(cleared).toBe(0);
    });
  });
});
