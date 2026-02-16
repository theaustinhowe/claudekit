import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSessionManager } from "./session-manager.js";
import type { SessionEvent, SessionPersistence, SessionRunner } from "./types.js";

function createMockPersistence(): SessionPersistence {
  return {
    loadSession: vi.fn(),
    updateSession: vi.fn().mockResolvedValue(undefined),
    persistLogs: vi.fn().mockResolvedValue(undefined),
  };
}

function defaultSessionRow(
  overrides: Partial<{ session_type: string; label: string; status: string; pid: number | null }> = {},
) {
  return {
    session_type: "audit",
    label: "Test Session",
    status: "pending",
    pid: null,
    ...overrides,
  };
}

describe("createSessionManager", () => {
  let persistence: SessionPersistence;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    persistence = createMockPersistence();
    // Clean up globalThis cache between tests
    const g = globalThis as { __session_manager?: unknown };
    delete g.__session_manager;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ---------------------------------------------------------------------------
  // startSession
  // ---------------------------------------------------------------------------

  describe("startSession", () => {
    it("should load session from persistence and update status to running", async () => {
      vi.mocked(persistence.loadSession).mockResolvedValue(defaultSessionRow());

      const runner: SessionRunner = async () => ({ result: {} });
      const manager = createSessionManager({ persistence, useGlobalCache: false });

      const live = await manager.startSession("s1", runner);

      expect(persistence.loadSession).toHaveBeenCalledWith("s1");
      expect(persistence.updateSession).toHaveBeenCalledWith(
        "s1",
        expect.objectContaining({
          status: "running",
          started_at: expect.any(String),
        }),
      );
      expect(live.id).toBe("s1");
      expect(live.sessionType).toBe("audit");
      expect(live.label).toBe("Test Session");
    });

    it("should throw if session not found in persistence", async () => {
      vi.mocked(persistence.loadSession).mockResolvedValue(null);

      const manager = createSessionManager({ persistence, useGlobalCache: false });

      await expect(manager.startSession("missing", async () => ({ result: {} }))).rejects.toThrow(
        "Session missing not found",
      );
    });

    it("should send init event on start", async () => {
      vi.mocked(persistence.loadSession).mockResolvedValue(defaultSessionRow());

      const runner: SessionRunner = async () => ({ result: {} });
      const manager = createSessionManager({ persistence, useGlobalCache: false });

      const live = await manager.startSession("s1", runner);

      expect(live.events.length).toBeGreaterThanOrEqual(1);
      const initEvent = live.events.find((e) => e.type === "init");
      expect(initEvent).toBeDefined();
      expect(initEvent?.message).toBe("Starting Test Session");
      expect(initEvent?.data).toEqual({ sessionType: "audit", label: "Test Session" });
    });

    it("should return existing session if already running", async () => {
      vi.mocked(persistence.loadSession).mockResolvedValue(defaultSessionRow());

      let resolveRunner!: (v: { result?: Record<string, unknown> }) => void;
      const runner: SessionRunner = () =>
        new Promise((resolve) => {
          resolveRunner = resolve;
        });

      const manager = createSessionManager({ persistence, useGlobalCache: false });

      const first = await manager.startSession("s1", runner);
      const second = await manager.startSession("s1", async () => ({ result: {} }));

      expect(first).toBe(second);
      expect(persistence.loadSession).toHaveBeenCalledTimes(1);

      // Clean up: resolve the runner so completionPromise settles
      resolveRunner({ result: {} });
      await first.completionPromise;
    });

    it("should update status to done on successful completion", async () => {
      vi.mocked(persistence.loadSession).mockResolvedValue(defaultSessionRow());

      const runner: SessionRunner = async () => ({ result: { score: 42 } });
      const manager = createSessionManager({ persistence, useGlobalCache: false });

      const live = await manager.startSession("s1", runner);
      await live.completionPromise;

      expect(live.status).toBe("done");
      expect(persistence.updateSession).toHaveBeenCalledWith(
        "s1",
        expect.objectContaining({
          status: "done",
          progress: 100,
          completed_at: expect.any(String),
          result_json: JSON.stringify({ score: 42 }),
        }),
      );

      const doneEvent = live.events.find((e) => e.type === "done");
      expect(doneEvent).toBeDefined();
      expect(doneEvent?.progress).toBe(100);
      expect(doneEvent?.data).toEqual({ score: 42 });
    });

    it("should update status to error on runner failure", async () => {
      vi.mocked(persistence.loadSession).mockResolvedValue(defaultSessionRow());

      const runner: SessionRunner = async () => {
        throw new Error("Something broke");
      };
      const manager = createSessionManager({ persistence, useGlobalCache: false });

      const live = await manager.startSession("s1", runner);
      await live.completionPromise;

      expect(live.status).toBe("error");
      expect(persistence.updateSession).toHaveBeenCalledWith(
        "s1",
        expect.objectContaining({
          status: "error",
          completed_at: expect.any(String),
          error_message: "Something broke",
        }),
      );

      const errorEvent = live.events.find((e) => e.type === "error");
      expect(errorEvent).toBeDefined();
      expect(errorEvent?.message).toBe("Something broke");
    });

    it("should update status to cancelled on abort", async () => {
      vi.mocked(persistence.loadSession).mockResolvedValue(defaultSessionRow());

      const runner: SessionRunner = async ({ signal }) => {
        return new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            reject(signal.reason ?? new DOMException("The operation was aborted.", "AbortError"));
          });
        });
      };
      const manager = createSessionManager({ persistence, useGlobalCache: false });

      const live = await manager.startSession("s1", runner);

      // Cancel it
      const cancelled = await manager.cancelSession("s1");
      expect(cancelled).toBe(true);

      await live.completionPromise;

      expect(live.status).toBe("cancelled");
      expect(persistence.updateSession).toHaveBeenCalledWith(
        "s1",
        expect.objectContaining({
          status: "cancelled",
          completed_at: expect.any(String),
          error_message: "Cancelled by user",
        }),
      );

      const cancelledEvent = live.events.find((e) => e.type === "cancelled");
      expect(cancelledEvent).toBeDefined();
      expect(cancelledEvent?.message).toBe("Session cancelled");
    });

    it("should call cleanupFn on error", async () => {
      vi.mocked(persistence.loadSession).mockResolvedValue(defaultSessionRow());

      const cleanupFn = vi.fn().mockResolvedValue(undefined);
      const runner: SessionRunner = async () => {
        throw new Error("kaboom");
      };
      const manager = createSessionManager({ persistence, useGlobalCache: false });

      const live = await manager.startSession("s1", runner);
      manager.setCleanupFn("s1", cleanupFn);
      await live.completionPromise;

      expect(cleanupFn).toHaveBeenCalledTimes(1);
    });

    it("should call cleanupFn on abort", async () => {
      vi.mocked(persistence.loadSession).mockResolvedValue(defaultSessionRow());

      const cleanupFn = vi.fn().mockResolvedValue(undefined);
      const runner: SessionRunner = async ({ signal }) => {
        return new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        });
      };
      const manager = createSessionManager({ persistence, useGlobalCache: false });

      const live = await manager.startSession("s1", runner);
      manager.setCleanupFn("s1", cleanupFn);

      await manager.cancelSession("s1");
      await live.completionPromise;

      expect(cleanupFn).toHaveBeenCalledTimes(1);
    });

    it("should not throw if cleanupFn throws", async () => {
      vi.mocked(persistence.loadSession).mockResolvedValue(defaultSessionRow());

      const cleanupFn = vi.fn().mockRejectedValue(new Error("cleanup failed"));
      const runner: SessionRunner = async () => {
        throw new Error("runner failed");
      };
      const manager = createSessionManager({ persistence, useGlobalCache: false });

      const live = await manager.startSession("s1", runner);
      manager.setCleanupFn("s1", cleanupFn);

      // Should not throw despite cleanupFn failing
      await live.completionPromise;
      expect(cleanupFn).toHaveBeenCalledTimes(1);
      expect(live.status).toBe("error");
    });

    it("should persist progress and phase updates from runner", async () => {
      vi.mocked(persistence.loadSession).mockResolvedValue(defaultSessionRow());

      const runner: SessionRunner = async ({ onProgress }) => {
        onProgress({ type: "progress", progress: 50, phase: "scanning" });
        return { result: {} };
      };
      const manager = createSessionManager({ persistence, useGlobalCache: false });

      const live = await manager.startSession("s1", runner);
      await live.completionPromise;

      expect(persistence.updateSession).toHaveBeenCalledWith(
        "s1",
        expect.objectContaining({
          progress: 50,
          phase: "scanning",
        }),
      );
    });

    it("should clear subscribers after completion", async () => {
      vi.mocked(persistence.loadSession).mockResolvedValue(defaultSessionRow());

      let resolveRunner!: (v: { result?: Record<string, unknown> }) => void;
      const runner: SessionRunner = () =>
        new Promise((resolve) => {
          resolveRunner = resolve;
        });
      const manager = createSessionManager({ persistence, useGlobalCache: false });

      const live = await manager.startSession("s1", runner);

      const subscriber = vi.fn();
      manager.subscribe("s1", subscriber);

      expect(live.subscribers.size).toBe(1);

      resolveRunner({ result: {} });
      await live.completionPromise;

      expect(live.subscribers.size).toBe(0);
    });

    it("should handle result being undefined", async () => {
      vi.mocked(persistence.loadSession).mockResolvedValue(defaultSessionRow());

      const runner: SessionRunner = async () => ({});
      const manager = createSessionManager({ persistence, useGlobalCache: false });

      const live = await manager.startSession("s1", runner);
      await live.completionPromise;

      expect(persistence.updateSession).toHaveBeenCalledWith(
        "s1",
        expect.objectContaining({
          result_json: "{}",
        }),
      );
    });

    it("should stringify non-Error throws", async () => {
      vi.mocked(persistence.loadSession).mockResolvedValue(defaultSessionRow());

      const runner: SessionRunner = async () => {
        throw "string error";
      };
      const manager = createSessionManager({ persistence, useGlobalCache: false });

      const live = await manager.startSession("s1", runner);
      await live.completionPromise;

      expect(live.status).toBe("error");
      expect(persistence.updateSession).toHaveBeenCalledWith(
        "s1",
        expect.objectContaining({
          error_message: "string error",
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // cancelSession
  // ---------------------------------------------------------------------------

  describe("cancelSession", () => {
    it("should abort a running session", async () => {
      vi.mocked(persistence.loadSession).mockResolvedValue(defaultSessionRow());

      let _resolveRunner!: (v: { result?: Record<string, unknown> }) => void;
      const runner: SessionRunner = ({ signal }) =>
        new Promise((resolve, reject) => {
          _resolveRunner = resolve;
          signal.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        });
      const manager = createSessionManager({ persistence, useGlobalCache: false });

      const live = await manager.startSession("s1", runner);
      const result = await manager.cancelSession("s1");

      expect(result).toBe(true);
      expect(live.abortController.signal.aborted).toBe(true);

      await live.completionPromise;
    });

    it("should return false for non-existent session", async () => {
      vi.mocked(persistence.loadSession).mockResolvedValue(null);

      const manager = createSessionManager({ persistence, useGlobalCache: false });
      const result = await manager.cancelSession("does-not-exist");

      expect(result).toBe(false);
    });

    it("should return false for session that is already completed", async () => {
      vi.mocked(persistence.loadSession).mockResolvedValue(defaultSessionRow({ status: "done" }));

      const manager = createSessionManager({ persistence, useGlobalCache: false });
      const result = await manager.cancelSession("done-session");

      expect(result).toBe(false);
    });

    it("should handle orphaned session with PID", async () => {
      // No in-memory session, but DB shows running with PID
      vi.mocked(persistence.loadSession).mockResolvedValue(defaultSessionRow({ status: "running", pid: 12345 }));

      const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);

      const manager = createSessionManager({ persistence, useGlobalCache: false });
      const result = await manager.cancelSession("orphaned-session");

      expect(result).toBe(true);
      expect(killSpy).toHaveBeenCalledWith(12345, "SIGTERM");
      expect(persistence.updateSession).toHaveBeenCalledWith(
        "orphaned-session",
        expect.objectContaining({
          status: "cancelled",
          completed_at: expect.any(String),
          error_message: "Cancelled (orphaned session)",
        }),
      );

      killSpy.mockRestore();
    });

    it("should handle orphaned session where PID is already gone", async () => {
      vi.mocked(persistence.loadSession).mockResolvedValue(defaultSessionRow({ status: "running", pid: 99999 }));

      const killSpy = vi.spyOn(process, "kill").mockImplementation(() => {
        throw new Error("ESRCH");
      });

      const manager = createSessionManager({ persistence, useGlobalCache: false });
      const result = await manager.cancelSession("orphaned-dead");

      expect(result).toBe(true);
      expect(persistence.updateSession).toHaveBeenCalledWith(
        "orphaned-dead",
        expect.objectContaining({
          status: "cancelled",
        }),
      );

      killSpy.mockRestore();
    });

    it("should handle orphaned session in pending status", async () => {
      vi.mocked(persistence.loadSession).mockResolvedValue(defaultSessionRow({ status: "pending" }));

      const manager = createSessionManager({ persistence, useGlobalCache: false });
      const result = await manager.cancelSession("pending-orphan");

      expect(result).toBe(true);
      expect(persistence.updateSession).toHaveBeenCalledWith(
        "pending-orphan",
        expect.objectContaining({
          status: "cancelled",
          error_message: "Cancelled (orphaned session)",
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // subscribe
  // ---------------------------------------------------------------------------

  describe("subscribe", () => {
    it("should return null for non-existent session", () => {
      const manager = createSessionManager({ persistence, useGlobalCache: false });
      const result = manager.subscribe("nope", () => {});

      expect(result).toBeNull();
    });

    it("should replay buffered events on subscribe", async () => {
      vi.mocked(persistence.loadSession).mockResolvedValue(defaultSessionRow());

      let resolveRunner!: (v: { result?: Record<string, unknown> }) => void;
      const runner: SessionRunner = () =>
        new Promise((resolve) => {
          resolveRunner = resolve;
        });
      const manager = createSessionManager({ persistence, useGlobalCache: false });

      const live = await manager.startSession("s1", runner);

      // At this point, the init event is already in the buffer
      const received: SessionEvent[] = [];
      manager.subscribe("s1", (event) => received.push(event));

      // Should have received the init event via replay
      expect(received.length).toBeGreaterThanOrEqual(1);
      expect(received[0].type).toBe("init");

      resolveRunner({ result: {} });
      await live.completionPromise;
    });

    it("should add subscriber and receive future events", async () => {
      vi.mocked(persistence.loadSession).mockResolvedValue(defaultSessionRow());

      let onProgress!: (event: SessionEvent) => void;
      const runner: SessionRunner = (ctx) =>
        new Promise((_resolve) => {
          onProgress = ctx.onProgress;
          // Don't resolve yet so session stays running
        });
      const manager = createSessionManager({ persistence, useGlobalCache: false });

      await manager.startSession("s1", runner);

      const received: SessionEvent[] = [];
      manager.subscribe("s1", (event) => received.push(event));

      // Clear replayed events
      received.length = 0;

      // Emit a progress event
      onProgress({ type: "progress", progress: 50 });

      expect(received).toHaveLength(1);
      expect(received[0].type).toBe("progress");
      expect(received[0].progress).toBe(50);
    });

    it("should return unsubscribe function that removes subscriber", async () => {
      vi.mocked(persistence.loadSession).mockResolvedValue(defaultSessionRow());

      let onProgress!: (event: SessionEvent) => void;
      const runner: SessionRunner = (ctx) =>
        new Promise((_resolve) => {
          onProgress = ctx.onProgress;
        });
      const manager = createSessionManager({ persistence, useGlobalCache: false });

      const live = await manager.startSession("s1", runner);

      const received: SessionEvent[] = [];
      const unsub = manager.subscribe("s1", (event) => received.push(event));
      expect(unsub).not.toBeNull();

      // Clear replayed events
      received.length = 0;

      // Unsubscribe
      unsub?.();

      // Events after unsubscribe should not be received
      onProgress({ type: "progress", progress: 75 });

      expect(received).toHaveLength(0);
      expect(live.subscribers.size).toBe(0);
    });

    it("should return no-op unsubscribe if session is already completed", async () => {
      vi.mocked(persistence.loadSession).mockResolvedValue(defaultSessionRow());

      const runner: SessionRunner = async () => ({ result: {} });
      const manager = createSessionManager({ persistence, useGlobalCache: false });

      const live = await manager.startSession("s1", runner);
      await live.completionPromise;

      const received: SessionEvent[] = [];
      const unsub = manager.subscribe("s1", (event) => received.push(event));

      // Should still replay buffered events
      expect(received.length).toBeGreaterThanOrEqual(1);

      // But unsub should be a no-op function (not null)
      expect(unsub).not.toBeNull();
      expect(typeof unsub).toBe("function");
    });

    it("should not crash if subscriber throws during replay", async () => {
      vi.mocked(persistence.loadSession).mockResolvedValue(defaultSessionRow());

      let resolveRunner!: (v: { result?: Record<string, unknown> }) => void;
      const runner: SessionRunner = () =>
        new Promise((resolve) => {
          resolveRunner = resolve;
        });
      const manager = createSessionManager({ persistence, useGlobalCache: false });

      await manager.startSession("s1", runner);

      // Subscriber that throws
      const unsub = manager.subscribe("s1", () => {
        throw new Error("subscriber error");
      });

      expect(unsub).not.toBeNull();

      resolveRunner({ result: {} });
    });
  });

  // ---------------------------------------------------------------------------
  // getLiveSession
  // ---------------------------------------------------------------------------

  describe("getLiveSession", () => {
    it("should return undefined for non-existent session", () => {
      const manager = createSessionManager({ persistence, useGlobalCache: false });

      expect(manager.getLiveSession("nope")).toBeUndefined();
    });

    it("should return live session after start", async () => {
      vi.mocked(persistence.loadSession).mockResolvedValue(defaultSessionRow());

      const runner: SessionRunner = async () => ({ result: {} });
      const manager = createSessionManager({ persistence, useGlobalCache: false });

      const live = await manager.startSession("s1", runner);
      await live.completionPromise;

      const retrieved = manager.getLiveSession("s1");
      expect(retrieved).toBe(live);
    });
  });

  // ---------------------------------------------------------------------------
  // setCleanupFn
  // ---------------------------------------------------------------------------

  describe("setCleanupFn", () => {
    it("should set cleanup function on existing session", async () => {
      vi.mocked(persistence.loadSession).mockResolvedValue(defaultSessionRow());

      let resolveRunner!: (v: { result?: Record<string, unknown> }) => void;
      const runner: SessionRunner = () =>
        new Promise((resolve) => {
          resolveRunner = resolve;
        });
      const manager = createSessionManager({ persistence, useGlobalCache: false });

      const live = await manager.startSession("s1", runner);
      expect(live.cleanupFn).toBeNull();

      const fn = vi.fn().mockResolvedValue(undefined);
      manager.setCleanupFn("s1", fn);

      expect(live.cleanupFn).toBe(fn);

      resolveRunner({ result: {} });
      await live.completionPromise;
    });

    it("should do nothing for non-existent session", () => {
      const manager = createSessionManager({ persistence, useGlobalCache: false });

      // Should not throw
      manager.setCleanupFn("nope", async () => {});
    });
  });

  // ---------------------------------------------------------------------------
  // setSessionPid
  // ---------------------------------------------------------------------------

  describe("setSessionPid", () => {
    it("should persist PID for existing session", async () => {
      vi.mocked(persistence.loadSession).mockResolvedValue(defaultSessionRow());

      let resolveRunner!: (v: { result?: Record<string, unknown> }) => void;
      const runner: SessionRunner = () =>
        new Promise((resolve) => {
          resolveRunner = resolve;
        });
      const manager = createSessionManager({ persistence, useGlobalCache: false });

      await manager.startSession("s1", runner);

      await manager.setSessionPid("s1", 54321);

      expect(persistence.updateSession).toHaveBeenCalledWith("s1", { pid: 54321 });

      resolveRunner({ result: {} });
    });

    it("should do nothing for non-existent session", async () => {
      const manager = createSessionManager({ persistence, useGlobalCache: false });

      // Should not throw, and should not call persistence
      await manager.setSessionPid("nope", 12345);

      expect(persistence.updateSession).not.toHaveBeenCalled();
    });

    it("should not throw if persistence.updateSession fails", async () => {
      vi.mocked(persistence.loadSession).mockResolvedValue(defaultSessionRow());

      let resolveRunner!: (v: { result?: Record<string, unknown> }) => void;
      const runner: SessionRunner = () =>
        new Promise((resolve) => {
          resolveRunner = resolve;
        });
      const manager = createSessionManager({ persistence, useGlobalCache: false });

      await manager.startSession("s1", runner);

      // Now make updateSession reject for the setSessionPid call
      vi.mocked(persistence.updateSession).mockRejectedValueOnce(new Error("db down"));

      // Should not throw thanks to .catch(() => {}) in setSessionPid
      await manager.setSessionPid("s1", 12345);

      resolveRunner({ result: {} });
    });
  });

  // ---------------------------------------------------------------------------
  // Ring buffer
  // ---------------------------------------------------------------------------

  describe("ring buffer", () => {
    it("should limit events to configured buffer size", async () => {
      vi.mocked(persistence.loadSession).mockResolvedValue(defaultSessionRow());

      const bufferSize = 5;
      const runner: SessionRunner = async ({ onProgress }) => {
        for (let i = 0; i < 20; i++) {
          onProgress({ type: "progress", progress: i, message: `event-${i}` });
        }
        return { result: {} };
      };
      const manager = createSessionManager({ persistence, eventBufferSize: bufferSize, useGlobalCache: false });

      const live = await manager.startSession("s1", runner);
      await live.completionPromise;

      // Buffer should have at most bufferSize events
      // The runner produced 20 progress events + 1 init + 1 done = 22 events pushed
      // The ring buffer keeps the last bufferSize (5)
      expect(live.events.length).toBe(bufferSize);
    });

    it("should keep the most recent events when buffer overflows", async () => {
      vi.mocked(persistence.loadSession).mockResolvedValue(defaultSessionRow());

      const bufferSize = 3;
      const runner: SessionRunner = async ({ onProgress }) => {
        for (let i = 0; i < 10; i++) {
          onProgress({ type: "progress", progress: i, message: `event-${i}` });
        }
        return { result: {} };
      };
      const manager = createSessionManager({ persistence, eventBufferSize: bufferSize, useGlobalCache: false });

      const live = await manager.startSession("s1", runner);
      await live.completionPromise;

      // The last event pushed is "done", before that the last progress was event-9
      expect(live.events.length).toBe(bufferSize);
      const lastEvent = live.events[live.events.length - 1];
      expect(lastEvent.type).toBe("done");
    });

    it("should use default buffer size of 500", async () => {
      vi.mocked(persistence.loadSession).mockResolvedValue(defaultSessionRow());

      const runner: SessionRunner = async ({ onProgress }) => {
        for (let i = 0; i < 600; i++) {
          onProgress({ type: "log", log: `line-${i}`, logType: "status" });
        }
        return { result: {} };
      };
      const manager = createSessionManager({ persistence, useGlobalCache: false });

      const live = await manager.startSession("s1", runner);
      await live.completionPromise;

      // 600 log events + 1 init + 1 done = 602 total, buffer = 500
      expect(live.events.length).toBe(500);
    });
  });

  // ---------------------------------------------------------------------------
  // Log flush batching
  // ---------------------------------------------------------------------------

  describe("log flush batching", () => {
    it("should batch logs and flush on interval", async () => {
      vi.mocked(persistence.loadSession).mockResolvedValue(defaultSessionRow());

      let onProgress!: (event: SessionEvent) => void;
      const runner: SessionRunner = (ctx) =>
        new Promise((_resolve) => {
          onProgress = ctx.onProgress;
        });
      const manager = createSessionManager({
        persistence,
        logFlushIntervalMs: 2000,
        useGlobalCache: false,
      });

      await manager.startSession("s1", runner);

      // Emit some log events
      onProgress({ type: "log", log: "log line 1", logType: "status" });
      onProgress({ type: "log", log: "log line 2", logType: "error" });

      // Logs should not be persisted yet
      expect(persistence.persistLogs).not.toHaveBeenCalled();

      // Advance timer to trigger flush
      await vi.advanceTimersByTimeAsync(2000);

      expect(persistence.persistLogs).toHaveBeenCalledWith("s1", [
        { log: "log line 1", logType: "status" },
        { log: "log line 2", logType: "error" },
      ]);
    });

    it("should flush remaining logs on completion", async () => {
      vi.mocked(persistence.loadSession).mockResolvedValue(defaultSessionRow());

      const runner: SessionRunner = async ({ onProgress }) => {
        onProgress({ type: "log", log: "final log", logType: "info" });
        return { result: {} };
      };
      const manager = createSessionManager({ persistence, useGlobalCache: false });

      const live = await manager.startSession("s1", runner);
      await live.completionPromise;

      // Logs should have been flushed on completion even without interval
      expect(persistence.persistLogs).toHaveBeenCalledWith(
        "s1",
        expect.arrayContaining([{ log: "final log", logType: "info" }]),
      );
    });

    it("should flush remaining logs on error", async () => {
      vi.mocked(persistence.loadSession).mockResolvedValue(defaultSessionRow());

      const runner: SessionRunner = async ({ onProgress }) => {
        onProgress({ type: "log", log: "pre-error log", logType: "status" });
        throw new Error("fail");
      };
      const manager = createSessionManager({ persistence, useGlobalCache: false });

      const live = await manager.startSession("s1", runner);
      await live.completionPromise;

      expect(persistence.persistLogs).toHaveBeenCalledWith(
        "s1",
        expect.arrayContaining([{ log: "pre-error log", logType: "status" }]),
      );
    });

    it("should default logType to 'status' when not provided", async () => {
      vi.mocked(persistence.loadSession).mockResolvedValue(defaultSessionRow());

      const runner: SessionRunner = async ({ onProgress }) => {
        onProgress({ type: "log", log: "untyped log" });
        return { result: {} };
      };
      const manager = createSessionManager({ persistence, useGlobalCache: false });

      const live = await manager.startSession("s1", runner);
      await live.completionPromise;

      expect(persistence.persistLogs).toHaveBeenCalledWith("s1", [{ log: "untyped log", logType: "status" }]);
    });

    it("should not call persistLogs when there are no pending logs", async () => {
      vi.mocked(persistence.loadSession).mockResolvedValue(defaultSessionRow());

      let _onProgress!: (event: SessionEvent) => void;
      const runner: SessionRunner = (ctx) =>
        new Promise((_resolve) => {
          _onProgress = ctx.onProgress;
        });
      const manager = createSessionManager({
        persistence,
        logFlushIntervalMs: 1000,
        useGlobalCache: false,
      });

      await manager.startSession("s1", runner);

      // Advance timer without any log events
      await vi.advanceTimersByTimeAsync(1000);

      expect(persistence.persistLogs).not.toHaveBeenCalled();
    });

    it("should clear the flush timer on completion", async () => {
      vi.mocked(persistence.loadSession).mockResolvedValue(defaultSessionRow());

      const runner: SessionRunner = async () => ({ result: {} });
      const manager = createSessionManager({ persistence, useGlobalCache: false });

      const live = await manager.startSession("s1", runner);
      await live.completionPromise;

      expect(live.logFlushTimer).toBeNull();
    });

    it("should clear the flush timer on error", async () => {
      vi.mocked(persistence.loadSession).mockResolvedValue(defaultSessionRow());

      const runner: SessionRunner = async () => {
        throw new Error("fail");
      };
      const manager = createSessionManager({ persistence, useGlobalCache: false });

      const live = await manager.startSession("s1", runner);
      await live.completionPromise;

      expect(live.logFlushTimer).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Fan-out
  // ---------------------------------------------------------------------------

  describe("fan-out", () => {
    it("should not crash if a subscriber throws", async () => {
      vi.mocked(persistence.loadSession).mockResolvedValue(defaultSessionRow());

      let onProgress!: (event: SessionEvent) => void;
      const runner: SessionRunner = (ctx) =>
        new Promise((_resolve) => {
          onProgress = ctx.onProgress;
        });
      const manager = createSessionManager({ persistence, useGlobalCache: false });

      await manager.startSession("s1", runner);

      const throwingSub = vi.fn(() => {
        throw new Error("subscriber error");
      });
      const goodSub = vi.fn();

      manager.subscribe("s1", throwingSub);
      manager.subscribe("s1", goodSub);

      // Clear replayed events
      throwingSub.mockClear();
      goodSub.mockClear();

      // This should not throw even though throwingSub errors
      onProgress({ type: "progress", progress: 10 });

      expect(throwingSub).toHaveBeenCalledTimes(1);
      expect(goodSub).toHaveBeenCalledTimes(1);
    });

    it("should not collect non-log events as pending logs", async () => {
      vi.mocked(persistence.loadSession).mockResolvedValue(defaultSessionRow());

      let onProgress!: (event: SessionEvent) => void;
      let resolveRunner!: (v: { result?: Record<string, unknown> }) => void;
      const runner: SessionRunner = (ctx) =>
        new Promise((resolve) => {
          onProgress = ctx.onProgress;
          resolveRunner = resolve;
        });
      const manager = createSessionManager({ persistence, useGlobalCache: false });

      const live = await manager.startSession("s1", runner);

      // Emit events without log field
      onProgress({ type: "progress", progress: 50 });
      onProgress({ type: "chunk", chunk: "some data" });

      expect(live.pendingLogs).toHaveLength(0);

      resolveRunner({ result: {} });
      await live.completionPromise;
    });
  });

  // ---------------------------------------------------------------------------
  // globalThis caching
  // ---------------------------------------------------------------------------

  describe("globalThis caching", () => {
    it("should share sessions across manager instances when useGlobalCache is true", async () => {
      vi.mocked(persistence.loadSession).mockResolvedValue(defaultSessionRow());

      const runner: SessionRunner = async () => ({ result: {} });

      const manager1 = createSessionManager({ persistence, useGlobalCache: true });
      const live = await manager1.startSession("shared-1", runner);
      await live.completionPromise;

      const manager2 = createSessionManager({ persistence, useGlobalCache: true });
      const retrieved = manager2.getLiveSession("shared-1");

      expect(retrieved).toBe(live);
    });

    it("should isolate sessions when useGlobalCache is false", async () => {
      vi.mocked(persistence.loadSession).mockResolvedValue(defaultSessionRow());

      const runner: SessionRunner = async () => ({ result: {} });

      const manager1 = createSessionManager({ persistence, useGlobalCache: false });
      const live = await manager1.startSession("isolated-1", runner);
      await live.completionPromise;

      const manager2 = createSessionManager({ persistence, useGlobalCache: false });
      const retrieved = manager2.getLiveSession("isolated-1");

      expect(retrieved).toBeUndefined();
    });
  });
});
