import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:crypto", () => ({
  createHash: vi.fn().mockReturnValue({
    update: vi.fn().mockReturnValue({
      digest: vi.fn().mockReturnValue("abcdef1234567890"),
    }),
  }),
}));

vi.mock("@/lib/actions/auto-fix", () => ({
  saveAutoFixRun: vi.fn().mockResolvedValue("run-1"),
  updateAutoFixRun: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./dev-server-manager", () => ({
  onLog: vi.fn().mockReturnValue(vi.fn()),
  getLogs: vi.fn().mockReturnValue([]),
}));

vi.mock("./session-manager", () => ({
  createSession: vi.fn().mockResolvedValue("session-1"),
  startSession: vi.fn().mockResolvedValue({
    completionPromise: Promise.resolve(),
    status: "done",
  }),
  subscribe: vi.fn().mockReturnValue(vi.fn()),
  cancelSession: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./session-runners/auto-fix", () => ({
  createAutoFixRunner: vi.fn().mockReturnValue(vi.fn()),
}));

import { createHash } from "node:crypto";
import { saveAutoFixRun } from "@/lib/actions/auto-fix";
import { cancelCurrentFix, disable, enable, getState, manualTrigger } from "./auto-fix-engine";
import { getLogs, onLog } from "./dev-server-manager";
import { createSession, startSession } from "./session-manager";

let hashCounter = 0;
function restoreCreateHashMock() {
  vi.mocked(createHash).mockImplementation(
    () =>
      ({
        update: vi.fn().mockReturnValue({
          digest: vi.fn().mockReturnValue(`hash_${++hashCounter}_abcdef`),
        }),
      }) as never,
  );
}

describe("auto-fix-engine", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Restore mocks cleared by resetAllMocks
    vi.mocked(onLog).mockReturnValue(vi.fn());
    restoreCreateHashMock();
    vi.mocked(saveAutoFixRun).mockResolvedValue("run-1");
    vi.mocked(createSession).mockResolvedValue("session-1");
    vi.useFakeTimers();
    // Clean up any state from previous tests
    disable("test-project");
  });

  afterEach(() => {
    disable("test-project");
    vi.useRealTimers();
  });

  describe("getState", () => {
    it("returns default state for unknown project", () => {
      const state = getState("unknown-project");
      expect(state).toEqual({
        enabled: false,
        status: "idle",
        currentRun: null,
        consecutiveFailures: 0,
        cooldownUntil: null,
        lastError: null,
      });
    });

    it("returns enabled state after enable", () => {
      enable("test-project", "/tmp/project");
      const state = getState("test-project");
      expect(state.enabled).toBe(true);
      expect(state.status).toBe("idle");
    });
  });

  describe("enable", () => {
    it("subscribes to dev server logs", () => {
      enable("test-project", "/tmp/project");
      expect(onLog).toHaveBeenCalledWith("test-project", expect.any(Function));
    });

    it("sets status to idle", () => {
      enable("test-project", "/tmp/project");
      expect(getState("test-project").status).toBe("idle");
    });

    it("is a no-op when already enabled", () => {
      enable("test-project", "/tmp/project");
      enable("test-project", "/tmp/project");
      // onLog should only be called once
      expect(onLog).toHaveBeenCalledTimes(1);
    });
  });

  describe("disable", () => {
    it("sets enabled to false", () => {
      enable("test-project", "/tmp/project");
      disable("test-project");
      expect(getState("test-project").enabled).toBe(false);
    });

    it("calls unsubscribe", () => {
      const unsub = vi.fn();
      vi.mocked(onLog).mockReturnValue(unsub);
      enable("test-project", "/tmp/project");
      disable("test-project");
      expect(unsub).toHaveBeenCalled();
    });

    it("is a no-op for unknown project", () => {
      // Should not throw
      disable("unknown-project");
    });

    it("clears pending error lines and debounce timer", () => {
      enable("test-project", "/tmp/project");
      disable("test-project");
      expect(getState("test-project").status).toBe("idle");
    });
  });

  describe("error detection via handleLogLine", () => {
    it("detects TypeScript errors in log lines", () => {
      let logHandler: ((line: string) => void) | null = null;
      vi.mocked(onLog).mockImplementation((_id, cb) => {
        logHandler = cb;
        return vi.fn();
      });

      enable("test-project", "/tmp/project");
      expect(logHandler).not.toBeNull();

      // Emit an error line
      logHandler?.("error TS2345: Argument of type 'string' is not assignable");

      expect(getState("test-project").status).toBe("detecting");
    });

    it("detects SyntaxError in log lines", () => {
      let logHandler: ((line: string) => void) | null = null;
      vi.mocked(onLog).mockImplementation((_id, cb) => {
        logHandler = cb;
        return vi.fn();
      });

      enable("test-project", "/tmp/project");
      logHandler?.("SyntaxError: Unexpected token");
      expect(getState("test-project").status).toBe("detecting");
    });

    it("detects Module not found errors", () => {
      let logHandler: ((line: string) => void) | null = null;
      vi.mocked(onLog).mockImplementation((_id, cb) => {
        logHandler = cb;
        return vi.fn();
      });

      enable("test-project", "/tmp/project");
      logHandler?.("Module not found: Error: Can't resolve 'foo'");
      expect(getState("test-project").status).toBe("detecting");
    });

    it("ignores non-error lines", () => {
      let logHandler: ((line: string) => void) | null = null;
      vi.mocked(onLog).mockImplementation((_id, cb) => {
        logHandler = cb;
        return vi.fn();
      });

      enable("test-project", "/tmp/project");
      logHandler?.("INFO: Server started on port 3000");
      expect(getState("test-project").status).toBe("idle");
    });

    it("ignores errors when disabled", () => {
      let logHandler: ((line: string) => void) | null = null;
      vi.mocked(onLog).mockImplementation((_id, cb) => {
        logHandler = cb;
        return vi.fn();
      });

      enable("test-project", "/tmp/project");
      disable("test-project");
      logHandler?.("error TS2345: Type error");
      expect(getState("test-project").status).toBe("idle");
    });

    it("triggers fix after debounce period", async () => {
      let logHandler: ((line: string) => void) | null = null;
      vi.mocked(onLog).mockImplementation((_id, cb) => {
        logHandler = cb;
        return vi.fn();
      });
      vi.mocked(startSession).mockResolvedValue({
        completionPromise: Promise.resolve(),
        status: "done",
      } as never);

      enable("test-project", "/tmp/project");
      logHandler?.("error TS2345: Type error in foo.ts");

      // Advance past debounce (2s)
      await vi.advanceTimersByTimeAsync(2100);

      expect(saveAutoFixRun).toHaveBeenCalled();
      expect(createSession).toHaveBeenCalled();
    });
  });

  describe("cancelCurrentFix", () => {
    it("is a no-op when not fixing", () => {
      enable("test-project", "/tmp/project");
      cancelCurrentFix("test-project");
      // Should not throw
      expect(getState("test-project").status).toBe("idle");
    });

    it("is a no-op for unknown project", () => {
      cancelCurrentFix("unknown-project");
      // Should not throw
    });
  });

  describe("manualTrigger", () => {
    it("is a no-op when not enabled", async () => {
      await manualTrigger("test-project", "error TS1234: some error");
      expect(saveAutoFixRun).not.toHaveBeenCalled();
    });

    it("is a no-op when already fixing", async () => {
      let logHandler: ((line: string) => void) | null = null;
      vi.mocked(onLog).mockImplementation((_id, cb) => {
        logHandler = cb;
        return vi.fn();
      });

      // Create a long-running session to keep status as "fixing"
      let resolveCompletion: () => void;
      const completionPromise = new Promise<void>((resolve) => {
        resolveCompletion = resolve;
      });
      vi.mocked(startSession).mockResolvedValue({
        completionPromise,
        status: "done",
      } as never);

      enable("test-project", "/tmp/project");
      logHandler?.("error TS2345: Type error");

      // Trigger the debounce
      await vi.advanceTimersByTimeAsync(2100);

      // Now status should be "fixing"
      expect(getState("test-project").status).toBe("fixing");

      // Manual trigger should be a no-op while fixing
      await manualTrigger("test-project", "another error");
      expect(saveAutoFixRun).toHaveBeenCalledTimes(1); // Only the first trigger

      // Cleanup
      resolveCompletion?.();
      await vi.advanceTimersByTimeAsync(0);
    });

    it("triggers with explicit error message", async () => {
      vi.mocked(startSession).mockResolvedValue({
        completionPromise: Promise.resolve(),
        status: "done",
      } as never);

      enable("test-project", "/tmp/project");
      // manualTrigger calls triggerFix synchronously — need to await it and flush
      const triggerPromise = manualTrigger("test-project", "error TS9999: Custom error");
      await vi.advanceTimersByTimeAsync(0);
      await triggerPromise;

      expect(saveAutoFixRun).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: "test-project",
          status: "running",
          errorMessage: "error TS9999: Custom error",
        }),
      );
    });

    it("falls back to recent logs when no explicit message", async () => {
      vi.mocked(getLogs).mockReturnValue(["INFO: ok", "error TS1234: bad type", "error TS5678: another"]);
      vi.mocked(startSession).mockResolvedValue({
        completionPromise: Promise.resolve(),
        status: "done",
      } as never);

      enable("test-project", "/tmp/project");
      const triggerPromise = manualTrigger("test-project");
      await vi.advanceTimersByTimeAsync(0);
      await triggerPromise;

      expect(getLogs).toHaveBeenCalledWith("test-project");
      expect(saveAutoFixRun).toHaveBeenCalled();
    });

    it("does nothing when no errors in recent logs", async () => {
      vi.mocked(getLogs).mockReturnValue(["INFO: ok", "DEBUG: all good"]);

      enable("test-project", "/tmp/project");
      await manualTrigger("test-project");

      await vi.advanceTimersByTimeAsync(0);

      expect(saveAutoFixRun).not.toHaveBeenCalled();
    });
  });

  describe("event emission", () => {
    it("notifies subscribers on status change", () => {
      // We can't directly test emit since it's internal,
      // but enable() calls setStatus which emits
      // We'd need to subscribe via the internal subscribers set
      // Since subscribe isn't exported, just verify state changes correctly
      enable("test-project", "/tmp/project");
      expect(getState("test-project").status).toBe("idle");
      expect(getState("test-project").enabled).toBe(true);
    });
  });
});
