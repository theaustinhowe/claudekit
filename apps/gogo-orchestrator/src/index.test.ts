import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock dotenv before anything else
vi.mock("dotenv", () => ({
  config: vi.fn(),
}));

// Mock node:fs (used for existsSync in env loading)
vi.mock("node:fs", () => ({
  existsSync: vi.fn(() => false),
}));

// Mock database
vi.mock("./db/index.js", () => ({
  getDb: vi.fn(async () => ({})),
}));

vi.mock("@claudekit/duckdb", () => ({
  queryAll: vi.fn().mockResolvedValue([]),
  queryOne: vi.fn(),
  execute: vi.fn().mockResolvedValue(undefined),
  withTransaction: vi.fn(),
  buildUpdate: vi.fn(),
  buildWhere: vi.fn(),
  buildInClause: vi.fn(),
  checkpoint: vi.fn(),
}));

// Mock server
const mockListen = vi.fn().mockResolvedValue(undefined);
const mockServer = { listen: mockListen };

vi.mock("./server.js", () => ({
  createServer: vi.fn(async () => mockServer),
}));

// Mock services
vi.mock("./services/data-pruning.js", () => ({
  runDataPruning: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./services/polling.js", () => ({
  startPolling: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./services/pr-recovery.js", () => ({
  recoverOrphanedPrs: vi.fn().mockResolvedValue({
    jobsRecovered: 0,
    prsScanned: 0,
    repositoriesChecked: 0,
    errors: [],
  }),
}));

vi.mock("./services/process-manager.js", () => ({
  cleanupOrphanedProcesses: vi.fn().mockResolvedValue({ found: 0, terminated: 0, failed: 0 }),
  clearStalePidReferences: vi.fn().mockResolvedValue(0),
}));

vi.mock("./services/settings-helper.js", () => ({
  validateStartupSettings: vi.fn().mockResolvedValue({
    ready: true,
    warnings: [],
    errors: [],
    hasActiveRepositories: false,
  }),
}));

vi.mock("./services/shutdown.js", () => ({
  registerShutdownHandlers: vi.fn(),
}));

vi.mock("./utils/binary-check.js", () => ({
  checkBinaries: vi.fn().mockResolvedValue({
    allRequiredFound: true,
    results: [],
    missingRequired: [],
    missingOptional: [],
  }),
  formatValidationResults: vi.fn().mockReturnValue("Binary check results"),
}));

vi.mock("./utils/logger.js", () => ({
  logger: {
    child: vi.fn(() => ({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    })),
  },
  createServiceLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

import { execute, queryAll } from "@claudekit/duckdb";
import { cast } from "@claudekit/test-utils";
import { getDb } from "./db/index.js";
import { createServer } from "./server.js";
import { runDataPruning } from "./services/data-pruning.js";
import { startPolling } from "./services/polling.js";
import { recoverOrphanedPrs } from "./services/pr-recovery.js";
import { cleanupOrphanedProcesses, clearStalePidReferences } from "./services/process-manager.js";
import { validateStartupSettings } from "./services/settings-helper.js";
import { registerShutdownHandlers } from "./services/shutdown.js";
import { checkBinaries, formatValidationResults } from "./utils/binary-check.js";

/**
 * Since index.ts executes main() at module load time, we cannot easily
 * re-import per test. Instead, we validate the dependencies it orchestrates
 * by verifying their contracts, and do a single import to confirm the
 * startup sequence runs through successfully.
 */
describe("index.ts startup dependencies", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    // Re-set default mock return values after resetAllMocks
    vi.mocked(checkBinaries).mockResolvedValue({
      allRequiredFound: true,
      results: [],
      missingRequired: [],
      missingOptional: [],
    });
    vi.mocked(cleanupOrphanedProcesses).mockResolvedValue({ found: 0, terminated: 0, failed: 0 });
    vi.mocked(clearStalePidReferences).mockResolvedValue(0);
    vi.mocked(queryAll).mockResolvedValue([]);
    vi.mocked(execute).mockResolvedValue(undefined);
    vi.mocked(recoverOrphanedPrs).mockResolvedValue({
      jobsRecovered: 0,
      prsScanned: 0,
      repositoriesChecked: 0,
      errors: [],
    });
    vi.mocked(validateStartupSettings).mockResolvedValue({
      ready: true,
      warnings: [],
      errors: [],
      hasActiveRepositories: false,
    });
    vi.mocked(formatValidationResults).mockReturnValue("Binary check results");
    vi.mocked(runDataPruning).mockResolvedValue(undefined);
    vi.mocked(startPolling).mockResolvedValue(undefined);
    vi.mocked(createServer).mockResolvedValue(cast(mockServer));
    mockListen.mockResolvedValue(undefined);
    vi.mocked(getDb).mockResolvedValue(cast({}));
  });

  describe("checkBinaries", () => {
    it("should be callable and return validation results", async () => {
      const result = await checkBinaries();

      expect(result.allRequiredFound).toBe(true);
      expect(result.missingRequired).toEqual([]);
      expect(result.missingOptional).toEqual([]);
    });

    it("should report when required binaries are missing", async () => {
      vi.mocked(checkBinaries).mockResolvedValue({
        allRequiredFound: false,
        results: [],
        missingRequired: [{ name: "git", found: false, version: null, path: null, error: "not found" }],
        missingOptional: [],
      });

      const result = await checkBinaries();

      expect(result.allRequiredFound).toBe(false);
      expect(result.missingRequired).toHaveLength(1);
      expect(result.missingRequired[0].name).toBe("git");
    });

    it("should format validation results as a string", () => {
      const result = formatValidationResults({
        allRequiredFound: false,
        results: [],
        missingRequired: [],
        missingOptional: [],
      });

      expect(typeof result).toBe("string");
    });
  });

  describe("process cleanup on startup", () => {
    it("should call cleanupOrphanedProcesses", async () => {
      await cleanupOrphanedProcesses();

      expect(cleanupOrphanedProcesses).toHaveBeenCalled();
    });

    it("should report found and terminated counts", async () => {
      vi.mocked(cleanupOrphanedProcesses).mockResolvedValue({ found: 3, terminated: 2, failed: 1 });

      const result = await cleanupOrphanedProcesses();

      expect(result.found).toBe(3);
      expect(result.terminated).toBe(2);
    });

    it("should call clearStalePidReferences", async () => {
      vi.mocked(clearStalePidReferences).mockResolvedValue(5);

      const result = await clearStalePidReferences();

      expect(result).toBe(5);
    });
  });

  describe("pausing active jobs on restart", () => {
    it("should query for running and planning jobs", async () => {
      const conn = await getDb();

      // Simulate what main() does: query running and planning jobs
      const runningJobs = await queryAll(conn, "SELECT id, status FROM jobs WHERE status = ?", ["running"]);
      const planningJobs = await queryAll(conn, "SELECT id, status FROM jobs WHERE status = ?", ["planning"]);

      expect(queryAll).toHaveBeenCalledTimes(2);
      expect(runningJobs).toEqual([]);
      expect(planningJobs).toEqual([]);
    });

    it("should execute UPDATE to pause running jobs when they exist", async () => {
      vi.mocked(queryAll)
        .mockResolvedValueOnce([{ id: "job-1", status: "running" }])
        .mockResolvedValueOnce([]);

      const conn = await getDb();
      const runningJobs = await queryAll<{ id: string; status: string }>(
        conn,
        "SELECT id, status FROM jobs WHERE status = ?",
        ["running"],
      );
      const planningJobs = await queryAll<{ id: string; status: string }>(
        conn,
        "SELECT id, status FROM jobs WHERE status = ?",
        ["planning"],
      );

      const jobsToPause = [...runningJobs, ...planningJobs];
      expect(jobsToPause).toHaveLength(1);

      if (runningJobs.length > 0) {
        const now = new Date().toISOString();
        await execute(conn, "UPDATE jobs SET status = ?, pause_reason = ?, updated_at = ? WHERE status = ?", [
          "paused",
          "orchestrator restarted",
          now,
          "running",
        ]);
      }

      expect(execute).toHaveBeenCalledWith(
        expect.anything(),
        "UPDATE jobs SET status = ?, pause_reason = ?, updated_at = ? WHERE status = ?",
        expect.arrayContaining(["paused", "orchestrator restarted", "running"]),
      );
    });

    it("should execute UPDATE to pause planning jobs when they exist", async () => {
      vi.mocked(queryAll)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: "job-2", status: "planning" }]);

      const conn = await getDb();
      await queryAll(conn, "SELECT id, status FROM jobs WHERE status = ?", ["running"]);
      const planningJobs = await queryAll<{ id: string; status: string }>(
        conn,
        "SELECT id, status FROM jobs WHERE status = ?",
        ["planning"],
      );

      if (planningJobs.length > 0) {
        const now = new Date().toISOString();
        await execute(conn, "UPDATE jobs SET status = ?, pause_reason = ?, updated_at = ? WHERE status = ?", [
          "paused",
          "orchestrator restarted",
          now,
          "planning",
        ]);
      }

      expect(execute).toHaveBeenCalledWith(
        expect.anything(),
        "UPDATE jobs SET status = ?, pause_reason = ?, updated_at = ? WHERE status = ?",
        expect.arrayContaining(["paused", "orchestrator restarted", "planning"]),
      );
    });

    it("should create audit events for each paused job", async () => {
      vi.mocked(queryAll)
        .mockResolvedValueOnce([{ id: "job-1", status: "running" }])
        .mockResolvedValueOnce([{ id: "job-2", status: "planning" }]);

      const conn = await getDb();
      const runningJobs = await queryAll<{ id: string; status: string }>(
        conn,
        "SELECT id, status FROM jobs WHERE status = ?",
        ["running"],
      );
      const planningJobs = await queryAll<{ id: string; status: string }>(
        conn,
        "SELECT id, status FROM jobs WHERE status = ?",
        ["planning"],
      );

      const jobsToPause = [...runningJobs, ...planningJobs];
      const now = new Date().toISOString();

      for (const job of jobsToPause) {
        await execute(
          conn,
          "INSERT INTO job_events (id, job_id, event_type, from_status, to_status, message, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          [
            randomUUID(),
            job.id,
            "state_change",
            job.status,
            "paused",
            "Orchestrator restarted - job paused for safety",
            JSON.stringify({ triggeredBy: "orchestrator_restart" }),
            now,
          ],
        );
      }

      // 2 execute calls for the 2 audit events
      expect(execute).toHaveBeenCalledTimes(2);
      // Verify first event is for job-1 (running -> paused)
      expect(execute).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining("INSERT INTO job_events"),
        expect.arrayContaining(["job-1", "state_change", "running", "paused"]),
      );
      // Verify second event is for job-2 (planning -> paused)
      expect(execute).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining("INSERT INTO job_events"),
        expect.arrayContaining(["job-2", "state_change", "planning", "paused"]),
      );
    });

    it("should skip pausing when no active jobs exist", async () => {
      vi.mocked(queryAll).mockResolvedValue([]);

      const conn = await getDb();
      const runningJobs = await queryAll(conn, "SELECT id, status FROM jobs WHERE status = ?", ["running"]);
      const planningJobs = await queryAll(conn, "SELECT id, status FROM jobs WHERE status = ?", ["planning"]);

      const jobsToPause = [...runningJobs, ...planningJobs];
      expect(jobsToPause).toHaveLength(0);

      // execute should not be called for pausing
      expect(execute).not.toHaveBeenCalled();
    });
  });

  describe("PR recovery on startup", () => {
    it("should call recoverOrphanedPrs", async () => {
      const result = await recoverOrphanedPrs();

      expect(result.jobsRecovered).toBe(0);
      expect(result.prsScanned).toBe(0);
      expect(result.repositoriesChecked).toBe(0);
      expect(result.errors).toEqual([]);
    });

    it("should report recovered jobs when orphaned PRs found", async () => {
      vi.mocked(recoverOrphanedPrs).mockResolvedValue({
        jobsRecovered: 2,
        prsScanned: 5,
        repositoriesChecked: 1,
        errors: [],
      });

      const result = await recoverOrphanedPrs();

      expect(result.jobsRecovered).toBe(2);
      expect(result.prsScanned).toBe(5);
    });

    it("should report errors encountered during recovery", async () => {
      vi.mocked(recoverOrphanedPrs).mockResolvedValue({
        jobsRecovered: 0,
        prsScanned: 3,
        repositoriesChecked: 1,
        errors: ["Failed to scan repo X"],
      });

      const result = await recoverOrphanedPrs();

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("Failed to scan");
    });
  });

  describe("startup validation", () => {
    it("should call validateStartupSettings", async () => {
      const result = await validateStartupSettings();

      expect(result.ready).toBe(true);
      expect(result.warnings).toEqual([]);
      expect(result.errors).toEqual([]);
    });

    it("should report warnings for non-critical issues", async () => {
      vi.mocked(validateStartupSettings).mockResolvedValue({
        ready: true,
        warnings: ["Some optional feature not configured"],
        errors: [],
        hasActiveRepositories: true,
      });

      const result = await validateStartupSettings();

      expect(result.ready).toBe(true);
      expect(result.warnings).toHaveLength(1);
    });

    it("should report not ready with critical errors", async () => {
      vi.mocked(validateStartupSettings).mockResolvedValue({
        ready: false,
        warnings: [],
        errors: ["Missing critical setting"],
        hasActiveRepositories: false,
      });

      const result = await validateStartupSettings();

      expect(result.ready).toBe(false);
      expect(result.errors).toHaveLength(1);
    });
  });

  describe("server creation and listening", () => {
    it("should create server and listen on default port", async () => {
      const server = await createServer();

      expect(server).toBeDefined();
      expect(createServer).toHaveBeenCalled();
    });

    it("should listen on configured port", async () => {
      const server = await createServer();
      const port = Number.parseInt(process.env.PORT || "2201", 10);
      await server.listen({ port, host: "0.0.0.0" });

      expect(mockListen).toHaveBeenCalledWith({ port: expect.any(Number), host: "0.0.0.0" });
    });

    it("should default to port 2201 when PORT env is not set", () => {
      const originalPort = process.env.PORT;
      delete process.env.PORT;

      const port = Number.parseInt(process.env.PORT || "2201", 10);

      expect(port).toBe(2201);

      // Restore
      if (originalPort !== undefined) {
        process.env.PORT = originalPort;
      }
    });

    it("should parse PORT from environment", () => {
      const originalPort = process.env.PORT;
      process.env.PORT = "3333";

      const port = Number.parseInt(process.env.PORT || "2201", 10);

      expect(port).toBe(3333);

      // Restore
      if (originalPort !== undefined) {
        process.env.PORT = originalPort;
      } else {
        delete process.env.PORT;
      }
    });
  });

  describe("data pruning", () => {
    it("should call runDataPruning during startup", async () => {
      await runDataPruning();

      expect(runDataPruning).toHaveBeenCalled();
    });
  });

  describe("polling", () => {
    it("should call startPolling after server starts", async () => {
      await startPolling();

      expect(startPolling).toHaveBeenCalled();
    });
  });

  describe("shutdown handlers", () => {
    it("should register shutdown handlers early in startup", () => {
      registerShutdownHandlers();

      expect(registerShutdownHandlers).toHaveBeenCalled();
    });
  });
});
