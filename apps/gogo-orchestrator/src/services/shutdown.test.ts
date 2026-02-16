import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type SignalHandler = (...args: unknown[]) => Promise<void> | void;

describe("shutdown", () => {
  // biome-ignore lint/suspicious/noExplicitAny: process.exit mock type is complex
  let exitSpy: any;
  let mockStopPolling: ReturnType<typeof vi.fn>;
  let mockCloseDatabase: ReturnType<typeof vi.fn>;
  let mockRunnerStop: ReturnType<typeof vi.fn>;
  let mockRunnerIsRunning: ReturnType<typeof vi.fn>;
  let mockQueryAll: ReturnType<typeof vi.fn>;
  let mockExecute: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();

    mockStopPolling = vi.fn();
    mockCloseDatabase = vi.fn().mockResolvedValue(undefined);
    mockRunnerStop = vi.fn().mockResolvedValue(true);
    mockRunnerIsRunning = vi.fn().mockReturnValue(false);
    mockQueryAll = vi.fn().mockResolvedValue([]);
    mockExecute = vi.fn().mockResolvedValue(undefined);

    vi.doMock("../db/index.js", () => ({
      getDb: vi.fn(async () => ({})),
      closeDatabase: mockCloseDatabase,
    }));
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
    vi.doMock("./health-events.js", () => ({
      emitHealthEvent: vi.fn(),
    }));
    vi.doMock("../utils/job-logging.js", () => ({
      shutdownLogBuffers: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock("../utils/logger.js", () => ({
      createServiceLogger: () => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      }),
    }));
    vi.doMock("./agents/index.js", () => ({
      agentRegistry: {
        getAll: vi.fn().mockReturnValue([
          {
            displayName: "Mock Agent",
            getActiveRunCount: vi.fn().mockReturnValue(0),
            isRunning: mockRunnerIsRunning,
            stop: mockRunnerStop,
          },
        ]),
      },
    }));
    vi.doMock("./polling.js", () => ({
      stopPolling: mockStopPolling,
    }));

    exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      return undefined as never;
    });
  });

  afterEach(() => {
    exitSpy.mockRestore();
    // Clean up SIGTERM/SIGINT listeners we added
    process.removeAllListeners("SIGTERM");
    process.removeAllListeners("SIGINT");
  });

  describe("registerShutdownHandlers", () => {
    it("should register SIGTERM and SIGINT handlers", async () => {
      const onSpy = vi.spyOn(process, "on");
      const { registerShutdownHandlers } = await import("./shutdown.js");

      registerShutdownHandlers();

      expect(onSpy).toHaveBeenCalledWith("SIGTERM", expect.any(Function));
      expect(onSpy).toHaveBeenCalledWith("SIGINT", expect.any(Function));
      onSpy.mockRestore();
    });
  });

  describe("isShutdownInProgress", () => {
    it("should return false initially", async () => {
      const { isShutdownInProgress } = await import("./shutdown.js");
      expect(isShutdownInProgress()).toBe(false);
    });
  });

  describe("handleShutdown (via signal)", () => {
    it("should stop polling first", async () => {
      const { registerShutdownHandlers } = await import("./shutdown.js");
      registerShutdownHandlers();

      const handler = (process.listeners("SIGTERM") as SignalHandler[]).pop();
      if (handler) await handler();

      expect(mockStopPolling).toHaveBeenCalled();
    });

    it("should close the database", async () => {
      const { registerShutdownHandlers } = await import("./shutdown.js");
      registerShutdownHandlers();

      const handler = (process.listeners("SIGTERM") as SignalHandler[]).pop();
      if (handler) await handler();

      expect(mockCloseDatabase).toHaveBeenCalled();
    });

    it("should exit with code 0", async () => {
      const { registerShutdownHandlers } = await import("./shutdown.js");
      registerShutdownHandlers();

      const handler = (process.listeners("SIGTERM") as SignalHandler[]).pop();
      if (handler) await handler();

      expect(exitSpy).toHaveBeenCalledWith(0);
    });

    it("should stop active agent runs via registry", async () => {
      // Re-mock with active runs
      vi.doMock("./agents/index.js", () => ({
        agentRegistry: {
          getAll: vi.fn().mockReturnValue([
            {
              displayName: "Claude Code",
              getActiveRunCount: vi.fn().mockReturnValue(2),
              isRunning: vi.fn().mockReturnValue(true),
              stop: mockRunnerStop,
            },
          ]),
        },
      }));
      // Mock running jobs query to return jobs
      mockQueryAll.mockResolvedValue([{ id: "job-1" }, { id: "job-2" }]);

      const { registerShutdownHandlers } = await import("./shutdown.js");
      registerShutdownHandlers();

      const handler = (process.listeners("SIGTERM") as SignalHandler[]).pop();
      if (handler) await handler();

      expect(mockRunnerStop).toHaveBeenCalledWith("job-1", true);
      expect(mockRunnerStop).toHaveBeenCalledWith("job-2", true);
    });

    it("should continue shutdown even if stopping an agent run fails", async () => {
      mockRunnerStop.mockRejectedValue(new Error("Stop failed"));
      vi.doMock("./agents/index.js", () => ({
        agentRegistry: {
          getAll: vi.fn().mockReturnValue([
            {
              displayName: "Claude Code",
              getActiveRunCount: vi.fn().mockReturnValue(1),
              isRunning: vi.fn().mockReturnValue(true),
              stop: mockRunnerStop,
            },
          ]),
        },
      }));
      mockQueryAll.mockResolvedValue([{ id: "job-1" }]);

      const { registerShutdownHandlers } = await import("./shutdown.js");
      registerShutdownHandlers();

      const handler = (process.listeners("SIGTERM") as SignalHandler[]).pop();
      if (handler) await handler();

      expect(mockCloseDatabase).toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalledWith(0);
    });

    it("should be idempotent - second call is a no-op", async () => {
      const { registerShutdownHandlers, isShutdownInProgress } = await import("./shutdown.js");
      registerShutdownHandlers();

      const handler = (process.listeners("SIGTERM") as SignalHandler[]).pop();
      if (handler) {
        await handler();
        // Reset call counts
        mockStopPolling.mockClear();
        mockCloseDatabase.mockClear();
        // Second call should be a no-op
        await handler();
      }

      expect(isShutdownInProgress()).toBe(true);
      // Only called once from first invocation
      expect(mockStopPolling).not.toHaveBeenCalled();
      expect(mockCloseDatabase).not.toHaveBeenCalled();
    });
  });
});
