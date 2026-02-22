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
  cleanupOrphanedProcesses: vi.fn().mockResolvedValue({ found: 0, terminated: 0 }),
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

import { execute, queryAll } from "@devkit/duckdb";
import { createServer } from "./server.js";
import { checkBinaries, formatValidationResults } from "./utils/binary-check.js";
import { cleanupOrphanedProcesses, clearStalePidReferences } from "./services/process-manager.js";
import { recoverOrphanedPrs } from "./services/pr-recovery.js";
import { runDataPruning } from "./services/data-pruning.js";
import { validateStartupSettings } from "./services/settings-helper.js";
import { registerShutdownHandlers } from "./services/shutdown.js";
import { startPolling } from "./services/polling.js";

/**
 * The main() function in index.ts is called at module load time and
 * catches errors. We can't easily re-import it each test, so we test
 * the individual services it calls. We also verify that a fresh import
 * runs through the startup sequence correctly.
 */
describe("index.ts startup sequence", () => {
  const originalExit = process.exit;
  const originalEnv = process.env.PORT;

  beforeEach(() => {
    vi.resetAllMocks();

    // Re-set default mock return values
    vi.mocked(checkBinaries).mockResolvedValue({
      allRequiredFound: true,
      results: [],
      missingRequired: [],
      missingOptional: [],
    });
    vi.mocked(cleanupOrphanedProcesses).mockResolvedValue({ found: 0, terminated: 0 });
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

    // Prevent process.exit from actually exiting
    process.exit = vi.fn() as never;
  });

  afterEach(() => {
    process.exit = originalExit;
    if (originalEnv !== undefined) {
      process.env.PORT = originalEnv;
    } else {
      delete process.env.PORT;
    }
  });

  describe("binary checks", () => {
    it("should call checkBinaries during startup", async () => {
      // Dynamically import to trigger main()
      vi.resetModules();

      // After resetModules, re-mock everything
      vi.doMock("dotenv", () => ({ config: vi.fn() }));
      vi.doMock("node:fs", () => ({ existsSync: vi.fn(() => false) }));
      vi.doMock("./db/index.js", () => ({ getDb: vi.fn(async () => ({})) }));
      vi.doMock("@devkit/duckdb", () => ({
        queryAll: vi.fn().mockResolvedValue([]),
        queryOne: vi.fn(),
        execute: vi.fn().mockResolvedValue(undefined),
        withTransaction: vi.fn(),
        buildUpdate: vi.fn(),
        buildWhere: vi.fn(),
        buildInClause: vi.fn(),
        checkpoint: vi.fn(),
      }));
      vi.doMock("./server.js", () => ({
        createServer: vi.fn(async () => ({ listen: vi.fn().mockResolvedValue(undefined) })),
      }));
      vi.doMock("./services/data-pruning.js", () => ({
        runDataPruning: vi.fn().mockResolvedValue(undefined),
      }));
      vi.doMock("./services/polling.js", () => ({
        startPolling: vi.fn().mockResolvedValue(undefined),
      }));
      vi.doMock("./services/pr-recovery.js", () => ({
        recoverOrphanedPrs: vi.fn().mockResolvedValue({
          jobsRecovered: 0,
          prsScanned: 0,
          repositoriesChecked: 0,
          errors: [],
        }),
      }));
      vi.doMock("./services/process-manager.js", () => ({
        cleanupOrphanedProcesses: vi.fn().mockResolvedValue({ found: 0, terminated: 0 }),
        clearStalePidReferences: vi.fn().mockResolvedValue(0),
      }));
      vi.doMock("./services/settings-helper.js", () => ({
        validateStartupSettings: vi.fn().mockResolvedValue({
          ready: true,
          warnings: [],
          errors: [],
          hasActiveRepositories: false,
        }),
      }));
      vi.doMock("./services/shutdown.js", () => ({
        registerShutdownHandlers: vi.fn(),
      }));

      const mockCheckBinaries = vi.fn().mockResolvedValue({
        allRequiredFound: true,
        results: [],
        missingRequired: [],
        missingOptional: [],
      });
      vi.doMock("./utils/binary-check.js", () => ({
        checkBinaries: mockCheckBinaries,
        formatValidationResults: vi.fn().mockReturnValue("results"),
      }));
      vi.doMock("./utils/logger.js", () => ({
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

      // Import triggers main()
      await import("./index.js");

      // Allow async main() to settle
      await new Promise((r) => setTimeout(r, 50));

      expect(mockCheckBinaries).toHaveBeenCalled();
    });
  });

  describe("pausing active jobs on restart", () => {
    it("should pause running and planning jobs on startup", async () => {
      vi.resetModules();

      const mockExecute = vi.fn().mockResolvedValue(undefined);
      const mockQueryAll = vi
        .fn()
        .mockResolvedValueOnce([{ id: "job-1", status: "running" }]) // running jobs
        .mockResolvedValueOnce([{ id: "job-2", status: "planning" }]); // planning jobs

      vi.doMock("dotenv", () => ({ config: vi.fn() }));
      vi.doMock("node:fs", () => ({ existsSync: vi.fn(() => false) }));
      vi.doMock("./db/index.js", () => ({ getDb: vi.fn(async () => ({})) }));
      vi.doMock("@devkit/duckdb", () => ({
        queryAll: mockQueryAll,
        queryOne: vi.fn(),
        execute: mockExecute,
        withTransaction: vi.fn(),
        buildUpdate: vi.fn(),
        buildWhere: vi.fn(),
        buildInClause: vi.fn(),
        checkpoint: vi.fn(),
      }));
      vi.doMock("./server.js", () => ({
        createServer: vi.fn(async () => ({ listen: vi.fn().mockResolvedValue(undefined) })),
      }));
      vi.doMock("./services/data-pruning.js", () => ({
        runDataPruning: vi.fn().mockResolvedValue(undefined),
      }));
      vi.doMock("./services/polling.js", () => ({
        startPolling: vi.fn().mockResolvedValue(undefined),
      }));
      vi.doMock("./services/pr-recovery.js", () => ({
        recoverOrphanedPrs: vi.fn().mockResolvedValue({
          jobsRecovered: 0,
          prsScanned: 0,
          repositoriesChecked: 0,
          errors: [],
        }),
      }));
      vi.doMock("./services/process-manager.js", () => ({
        cleanupOrphanedProcesses: vi.fn().mockResolvedValue({ found: 0, terminated: 0 }),
        clearStalePidReferences: vi.fn().mockResolvedValue(0),
      }));
      vi.doMock("./services/settings-helper.js", () => ({
        validateStartupSettings: vi.fn().mockResolvedValue({
          ready: true,
          warnings: [],
          errors: [],
          hasActiveRepositories: false,
        }),
      }));
      vi.doMock("./services/shutdown.js", () => ({
        registerShutdownHandlers: vi.fn(),
      }));
      vi.doMock("./utils/binary-check.js", () => ({
        checkBinaries: vi.fn().mockResolvedValue({
          allRequiredFound: true,
          results: [],
          missingRequired: [],
          missingOptional: [],
        }),
        formatValidationResults: vi.fn().mockReturnValue("results"),
      }));
      vi.doMock("./utils/logger.js", () => ({
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

      await import("./index.js");
      await new Promise((r) => setTimeout(r, 50));

      // Should have executed UPDATE statements for pausing running and planning jobs
      // and INSERT statements for audit events (2 jobs)
      // execute is called for: UPDATE running -> paused, UPDATE planning -> paused,
      // INSERT event for job-1, INSERT event for job-2
      expect(mockExecute).toHaveBeenCalled();

      // Check that one of the execute calls was an UPDATE to paused status
      const updateCalls = mockExecute.mock.calls.filter(
        (call) => typeof call[1] === "string" && call[1].includes("UPDATE jobs SET status"),
      );
      expect(updateCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("server startup", () => {
    it("should create and start the server on the configured port", async () => {
      vi.resetModules();

      process.env.PORT = "3333";

      const mockListenFn = vi.fn().mockResolvedValue(undefined);
      const mockCreateServer = vi.fn(async () => ({ listen: mockListenFn }));

      vi.doMock("dotenv", () => ({ config: vi.fn() }));
      vi.doMock("node:fs", () => ({ existsSync: vi.fn(() => false) }));
      vi.doMock("./db/index.js", () => ({ getDb: vi.fn(async () => ({})) }));
      vi.doMock("@devkit/duckdb", () => ({
        queryAll: vi.fn().mockResolvedValue([]),
        queryOne: vi.fn(),
        execute: vi.fn().mockResolvedValue(undefined),
        withTransaction: vi.fn(),
        buildUpdate: vi.fn(),
        buildWhere: vi.fn(),
        buildInClause: vi.fn(),
        checkpoint: vi.fn(),
      }));
      vi.doMock("./server.js", () => ({
        createServer: mockCreateServer,
      }));
      vi.doMock("./services/data-pruning.js", () => ({
        runDataPruning: vi.fn().mockResolvedValue(undefined),
      }));
      vi.doMock("./services/polling.js", () => ({
        startPolling: vi.fn().mockResolvedValue(undefined),
      }));
      vi.doMock("./services/pr-recovery.js", () => ({
        recoverOrphanedPrs: vi.fn().mockResolvedValue({
          jobsRecovered: 0,
          prsScanned: 0,
          repositoriesChecked: 0,
          errors: [],
        }),
      }));
      vi.doMock("./services/process-manager.js", () => ({
        cleanupOrphanedProcesses: vi.fn().mockResolvedValue({ found: 0, terminated: 0 }),
        clearStalePidReferences: vi.fn().mockResolvedValue(0),
      }));
      vi.doMock("./services/settings-helper.js", () => ({
        validateStartupSettings: vi.fn().mockResolvedValue({
          ready: true,
          warnings: [],
          errors: [],
          hasActiveRepositories: true,
        }),
      }));
      vi.doMock("./services/shutdown.js", () => ({
        registerShutdownHandlers: vi.fn(),
      }));
      vi.doMock("./utils/binary-check.js", () => ({
        checkBinaries: vi.fn().mockResolvedValue({
          allRequiredFound: true,
          results: [],
          missingRequired: [],
          missingOptional: [],
        }),
        formatValidationResults: vi.fn().mockReturnValue("results"),
      }));
      vi.doMock("./utils/logger.js", () => ({
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

      await import("./index.js");
      await new Promise((r) => setTimeout(r, 50));

      expect(mockCreateServer).toHaveBeenCalled();
      expect(mockListenFn).toHaveBeenCalledWith({ port: 3333, host: "0.0.0.0" });
    });

    it("should default to port 2201 when PORT env is not set", async () => {
      vi.resetModules();

      delete process.env.PORT;

      const mockListenFn = vi.fn().mockResolvedValue(undefined);

      vi.doMock("dotenv", () => ({ config: vi.fn() }));
      vi.doMock("node:fs", () => ({ existsSync: vi.fn(() => false) }));
      vi.doMock("./db/index.js", () => ({ getDb: vi.fn(async () => ({})) }));
      vi.doMock("@devkit/duckdb", () => ({
        queryAll: vi.fn().mockResolvedValue([]),
        queryOne: vi.fn(),
        execute: vi.fn().mockResolvedValue(undefined),
        withTransaction: vi.fn(),
        buildUpdate: vi.fn(),
        buildWhere: vi.fn(),
        buildInClause: vi.fn(),
        checkpoint: vi.fn(),
      }));
      vi.doMock("./server.js", () => ({
        createServer: vi.fn(async () => ({ listen: mockListenFn })),
      }));
      vi.doMock("./services/data-pruning.js", () => ({
        runDataPruning: vi.fn().mockResolvedValue(undefined),
      }));
      vi.doMock("./services/polling.js", () => ({
        startPolling: vi.fn().mockResolvedValue(undefined),
      }));
      vi.doMock("./services/pr-recovery.js", () => ({
        recoverOrphanedPrs: vi.fn().mockResolvedValue({
          jobsRecovered: 0,
          prsScanned: 0,
          repositoriesChecked: 0,
          errors: [],
        }),
      }));
      vi.doMock("./services/process-manager.js", () => ({
        cleanupOrphanedProcesses: vi.fn().mockResolvedValue({ found: 0, terminated: 0 }),
        clearStalePidReferences: vi.fn().mockResolvedValue(0),
      }));
      vi.doMock("./services/settings-helper.js", () => ({
        validateStartupSettings: vi.fn().mockResolvedValue({
          ready: true,
          warnings: [],
          errors: [],
          hasActiveRepositories: false,
        }),
      }));
      vi.doMock("./services/shutdown.js", () => ({
        registerShutdownHandlers: vi.fn(),
      }));
      vi.doMock("./utils/binary-check.js", () => ({
        checkBinaries: vi.fn().mockResolvedValue({
          allRequiredFound: true,
          results: [],
          missingRequired: [],
          missingOptional: [],
        }),
        formatValidationResults: vi.fn().mockReturnValue("results"),
      }));
      vi.doMock("./utils/logger.js", () => ({
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

      await import("./index.js");
      await new Promise((r) => setTimeout(r, 50));

      expect(mockListenFn).toHaveBeenCalledWith({ port: 2201, host: "0.0.0.0" });
    });
  });

  describe("binary check failures", () => {
    it("should exit when required binaries are missing", async () => {
      vi.resetModules();

      const mockProcessExit = vi.fn() as unknown as typeof process.exit;
      process.exit = mockProcessExit;

      vi.doMock("dotenv", () => ({ config: vi.fn() }));
      vi.doMock("node:fs", () => ({ existsSync: vi.fn(() => false) }));
      vi.doMock("./db/index.js", () => ({ getDb: vi.fn(async () => ({})) }));
      vi.doMock("@devkit/duckdb", () => ({
        queryAll: vi.fn().mockResolvedValue([]),
        queryOne: vi.fn(),
        execute: vi.fn().mockResolvedValue(undefined),
        withTransaction: vi.fn(),
        buildUpdate: vi.fn(),
        buildWhere: vi.fn(),
        buildInClause: vi.fn(),
        checkpoint: vi.fn(),
      }));
      vi.doMock("./server.js", () => ({
        createServer: vi.fn(async () => ({ listen: vi.fn().mockResolvedValue(undefined) })),
      }));
      vi.doMock("./services/data-pruning.js", () => ({
        runDataPruning: vi.fn().mockResolvedValue(undefined),
      }));
      vi.doMock("./services/polling.js", () => ({
        startPolling: vi.fn().mockResolvedValue(undefined),
      }));
      vi.doMock("./services/pr-recovery.js", () => ({
        recoverOrphanedPrs: vi.fn().mockResolvedValue({
          jobsRecovered: 0,
          prsScanned: 0,
          repositoriesChecked: 0,
          errors: [],
        }),
      }));
      vi.doMock("./services/process-manager.js", () => ({
        cleanupOrphanedProcesses: vi.fn().mockResolvedValue({ found: 0, terminated: 0 }),
        clearStalePidReferences: vi.fn().mockResolvedValue(0),
      }));
      vi.doMock("./services/settings-helper.js", () => ({
        validateStartupSettings: vi.fn().mockResolvedValue({
          ready: true,
          warnings: [],
          errors: [],
          hasActiveRepositories: false,
        }),
      }));
      vi.doMock("./services/shutdown.js", () => ({
        registerShutdownHandlers: vi.fn(),
      }));
      vi.doMock("./utils/binary-check.js", () => ({
        checkBinaries: vi.fn().mockResolvedValue({
          allRequiredFound: false,
          results: [],
          missingRequired: [{ name: "git", found: false, version: null, path: null, error: "not found" }],
          missingOptional: [],
        }),
        formatValidationResults: vi.fn().mockReturnValue("Missing: git"),
      }));
      vi.doMock("./utils/logger.js", () => ({
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

      await import("./index.js");
      await new Promise((r) => setTimeout(r, 50));

      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  describe("validation failures", () => {
    it("should exit when startup validation is not ready", async () => {
      vi.resetModules();

      const mockProcessExit = vi.fn() as unknown as typeof process.exit;
      process.exit = mockProcessExit;

      vi.doMock("dotenv", () => ({ config: vi.fn() }));
      vi.doMock("node:fs", () => ({ existsSync: vi.fn(() => false) }));
      vi.doMock("./db/index.js", () => ({ getDb: vi.fn(async () => ({})) }));
      vi.doMock("@devkit/duckdb", () => ({
        queryAll: vi.fn().mockResolvedValue([]),
        queryOne: vi.fn(),
        execute: vi.fn().mockResolvedValue(undefined),
        withTransaction: vi.fn(),
        buildUpdate: vi.fn(),
        buildWhere: vi.fn(),
        buildInClause: vi.fn(),
        checkpoint: vi.fn(),
      }));
      vi.doMock("./server.js", () => ({
        createServer: vi.fn(async () => ({ listen: vi.fn().mockResolvedValue(undefined) })),
      }));
      vi.doMock("./services/data-pruning.js", () => ({
        runDataPruning: vi.fn().mockResolvedValue(undefined),
      }));
      vi.doMock("./services/polling.js", () => ({
        startPolling: vi.fn().mockResolvedValue(undefined),
      }));
      vi.doMock("./services/pr-recovery.js", () => ({
        recoverOrphanedPrs: vi.fn().mockResolvedValue({
          jobsRecovered: 0,
          prsScanned: 0,
          repositoriesChecked: 0,
          errors: [],
        }),
      }));
      vi.doMock("./services/process-manager.js", () => ({
        cleanupOrphanedProcesses: vi.fn().mockResolvedValue({ found: 0, terminated: 0 }),
        clearStalePidReferences: vi.fn().mockResolvedValue(0),
      }));
      vi.doMock("./services/settings-helper.js", () => ({
        validateStartupSettings: vi.fn().mockResolvedValue({
          ready: false,
          warnings: [],
          errors: ["Critical error found"],
          hasActiveRepositories: false,
        }),
      }));
      vi.doMock("./services/shutdown.js", () => ({
        registerShutdownHandlers: vi.fn(),
      }));
      vi.doMock("./utils/binary-check.js", () => ({
        checkBinaries: vi.fn().mockResolvedValue({
          allRequiredFound: true,
          results: [],
          missingRequired: [],
          missingOptional: [],
        }),
        formatValidationResults: vi.fn().mockReturnValue("results"),
      }));
      vi.doMock("./utils/logger.js", () => ({
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

      await import("./index.js");
      await new Promise((r) => setTimeout(r, 50));

      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });
});
