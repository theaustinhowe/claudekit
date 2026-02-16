import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSessionSSEResponse, type SSEReplayCallbacks } from "./sse";
import type { SessionEvent, SessionManager } from "./types";

/** Consume a ReadableStream and return decoded SSE text events */
async function collectSSEEvents(response: Response): Promise<string[]> {
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  const events: string[] = [];
  let buffer = "";

  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (!reader) break;
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      if (part.trim()) events.push(part);
    }
  }
  if (buffer.trim()) events.push(buffer);
  return events;
}

/** Parse SSE data lines into objects */
function parseSSEData(events: string[]): Array<Record<string, unknown>> {
  return events
    .map((e) => {
      const match = e.match(/^data: (.+)$/m);
      if (!match) return null;
      if (match[1] === "[DONE]") return { __done: true };
      try {
        return JSON.parse(match[1]);
      } catch {
        return null;
      }
    })
    .filter(Boolean) as Array<Record<string, unknown>>;
}

function createMockManager(
  liveSession: boolean,
  subscribeFn?: (cb: (event: SessionEvent) => void) => (() => void) | null,
) {
  return {
    getLiveSession: vi.fn().mockReturnValue(liveSession ? { id: "test-session" } : null),
    subscribe: vi.fn().mockImplementation((_id: string, cb: (event: SessionEvent) => void) => {
      if (subscribeFn) return subscribeFn(cb);
      return vi.fn();
    }),
  } as unknown as Pick<SessionManager, "getLiveSession" | "subscribe">;
}

function createMockReplay(overrides?: Partial<SSEReplayCallbacks>): SSEReplayCallbacks {
  return {
    getSession: vi.fn().mockResolvedValue(null),
    getLogs: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function createMockRequest(): Request {
  const controller = new AbortController();
  return {
    signal: controller.signal,
  } as unknown as Request;
}

describe("createSessionSSEResponse", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("response headers", () => {
    it("sets correct SSE headers", () => {
      const manager = createMockManager(false);
      const replay = createMockReplay();
      const request = createMockRequest();

      const response = createSessionSSEResponse({
        sessionId: "s1",
        request,
        manager,
        replay,
      });

      expect(response.headers.get("Content-Type")).toBe("text/event-stream");
      expect(response.headers.get("Cache-Control")).toBe("no-cache");
      expect(response.headers.get("Connection")).toBe("keep-alive");
    });
  });

  describe("live subscription path", () => {
    it("forwards events from live session", async () => {
      let _subscriberCallback: ((event: SessionEvent) => void) | null = null;
      const manager = createMockManager(true, (cb) => {
        _subscriberCallback = cb;
        // Send events after subscribing
        queueMicrotask(() => {
          cb({ type: "log", log: "hello", logType: "stdout" } as SessionEvent);
          cb({ type: "done", progress: 100 } as SessionEvent);
        });
        return vi.fn();
      });
      const replay = createMockReplay();
      const request = createMockRequest();

      const response = createSessionSSEResponse({
        sessionId: "s1",
        request,
        manager,
        replay,
      });

      const events = await collectSSEEvents(response);
      const parsed = parseSSEData(events);

      expect(parsed.some((e) => e.type === "log" && e.log === "hello")).toBe(true);
      expect(parsed.some((e) => e.type === "done")).toBe(true);
    });

    it("closes stream on done event", async () => {
      const manager = createMockManager(true, (cb) => {
        queueMicrotask(() => {
          cb({ type: "done", progress: 100 } as SessionEvent);
        });
        return vi.fn();
      });
      const replay = createMockReplay();
      const request = createMockRequest();

      const response = createSessionSSEResponse({
        sessionId: "s1",
        request,
        manager,
        replay,
      });

      const events = await collectSSEEvents(response);
      const parsed = parseSSEData(events);

      expect(parsed.some((e) => e.__done === true)).toBe(true);
    });

    it("closes stream on error event", async () => {
      const manager = createMockManager(true, (cb) => {
        queueMicrotask(() => {
          cb({ type: "error", message: "something broke" } as SessionEvent);
        });
        return vi.fn();
      });
      const replay = createMockReplay();
      const request = createMockRequest();

      const response = createSessionSSEResponse({
        sessionId: "s1",
        request,
        manager,
        replay,
      });

      const events = await collectSSEEvents(response);
      const parsed = parseSSEData(events);

      expect(parsed.some((e) => e.type === "error")).toBe(true);
    });

    it("closes stream on cancelled event", async () => {
      const manager = createMockManager(true, (cb) => {
        queueMicrotask(() => {
          cb({ type: "cancelled" } as SessionEvent);
        });
        return vi.fn();
      });
      const replay = createMockReplay();
      const request = createMockRequest();

      const response = createSessionSSEResponse({
        sessionId: "s1",
        request,
        manager,
        replay,
      });

      const events = await collectSSEEvents(response);
      const parsed = parseSSEData(events);

      expect(parsed.some((e) => e.type === "cancelled")).toBe(true);
    });

    it("sends error when subscribe returns null", async () => {
      const manager = createMockManager(true, () => {
        return null;
      });
      const replay = createMockReplay();
      const request = createMockRequest();

      const response = createSessionSSEResponse({
        sessionId: "s1",
        request,
        manager,
        replay,
      });

      const events = await collectSSEEvents(response);
      const parsed = parseSSEData(events);

      expect(parsed.some((e) => e.type === "error" && e.message === "Session not found in memory")).toBe(true);
    });
  });

  describe("DB replay path", () => {
    it("replays stored logs", async () => {
      const manager = createMockManager(false);
      const replay = createMockReplay({
        getSession: vi.fn().mockResolvedValue({ status: "done", result_json: '{"count":5}' }),
        getLogs: vi.fn().mockResolvedValue([
          { log: "line 1", log_type: "stdout" },
          { log: "line 2", log_type: "stderr" },
        ]),
      });
      const request = createMockRequest();

      const response = createSessionSSEResponse({
        sessionId: "s1",
        request,
        manager,
        replay,
      });

      const events = await collectSSEEvents(response);
      const parsed = parseSSEData(events);

      expect(parsed.some((e) => e.type === "log" && e.log === "line 1")).toBe(true);
      expect(parsed.some((e) => e.type === "log" && e.log === "line 2")).toBe(true);
    });

    it("sends done with result_json data", async () => {
      const manager = createMockManager(false);
      const replay = createMockReplay({
        getSession: vi.fn().mockResolvedValue({ status: "done", result_json: '{"count":5}' }),
        getLogs: vi.fn().mockResolvedValue([]),
      });
      const request = createMockRequest();

      const response = createSessionSSEResponse({
        sessionId: "s1",
        request,
        manager,
        replay,
      });

      const events = await collectSSEEvents(response);
      const parsed = parseSSEData(events);

      const doneEvent = parsed.find((e) => e.type === "done");
      expect(doneEvent).toBeDefined();
      expect((doneEvent as Record<string, unknown>).data).toEqual({ count: 5 });
    });

    it("sends error for failed session", async () => {
      const manager = createMockManager(false);
      const replay = createMockReplay({
        getSession: vi.fn().mockResolvedValue({ status: "error", error_message: "Something failed" }),
        getLogs: vi.fn().mockResolvedValue([]),
      });
      const request = createMockRequest();

      const response = createSessionSSEResponse({
        sessionId: "s1",
        request,
        manager,
        replay,
      });

      const events = await collectSSEEvents(response);
      const parsed = parseSSEData(events);

      expect(parsed.some((e) => e.type === "error" && e.message === "Something failed")).toBe(true);
    });

    it("sends default error message when error_message is null", async () => {
      const manager = createMockManager(false);
      const replay = createMockReplay({
        getSession: vi.fn().mockResolvedValue({ status: "error", error_message: null }),
        getLogs: vi.fn().mockResolvedValue([]),
      });
      const request = createMockRequest();

      const response = createSessionSSEResponse({
        sessionId: "s1",
        request,
        manager,
        replay,
      });

      const events = await collectSSEEvents(response);
      const parsed = parseSSEData(events);

      expect(parsed.some((e) => e.type === "error" && e.message === "Session failed")).toBe(true);
    });

    it("sends cancelled for cancelled session", async () => {
      const manager = createMockManager(false);
      const replay = createMockReplay({
        getSession: vi.fn().mockResolvedValue({ status: "cancelled" }),
        getLogs: vi.fn().mockResolvedValue([]),
      });
      const request = createMockRequest();

      const response = createSessionSSEResponse({
        sessionId: "s1",
        request,
        manager,
        replay,
      });

      const events = await collectSSEEvents(response);
      const parsed = parseSSEData(events);

      expect(parsed.some((e) => e.type === "cancelled" && e.message === "Session was cancelled")).toBe(true);
    });

    it("sends interrupted error for pending/running sessions not in memory", async () => {
      const manager = createMockManager(false);
      const replay = createMockReplay({
        getSession: vi.fn().mockResolvedValue({ status: "running" }),
        getLogs: vi.fn().mockResolvedValue([]),
      });
      const request = createMockRequest();

      const response = createSessionSSEResponse({
        sessionId: "s1",
        request,
        manager,
        replay,
      });

      const events = await collectSSEEvents(response);
      const parsed = parseSSEData(events);

      expect(parsed.some((e) => e.type === "error" && e.message === "Session was interrupted (server restart)")).toBe(
        true,
      );
    });

    it("sends interrupted error for pending sessions", async () => {
      const manager = createMockManager(false);
      const replay = createMockReplay({
        getSession: vi.fn().mockResolvedValue({ status: "pending" }),
        getLogs: vi.fn().mockResolvedValue([]),
      });
      const request = createMockRequest();

      const response = createSessionSSEResponse({
        sessionId: "s1",
        request,
        manager,
        replay,
      });

      const events = await collectSSEEvents(response);
      const parsed = parseSSEData(events);

      expect(parsed.some((e) => e.type === "error" && e.message === "Session was interrupted (server restart)")).toBe(
        true,
      );
    });

    it("sends error when session not found in DB", async () => {
      const manager = createMockManager(false);
      const replay = createMockReplay({
        getSession: vi.fn().mockResolvedValue(null),
      });
      const request = createMockRequest();

      const response = createSessionSSEResponse({
        sessionId: "s1",
        request,
        manager,
        replay,
      });

      const events = await collectSSEEvents(response);
      const parsed = parseSSEData(events);

      expect(parsed.some((e) => e.type === "error" && e.message === "Session not found")).toBe(true);
    });

    it("sends error when replay throws", async () => {
      const manager = createMockManager(false);
      const replay = createMockReplay({
        getSession: vi.fn().mockRejectedValue(new Error("DB connection failed")),
      });
      const request = createMockRequest();

      const response = createSessionSSEResponse({
        sessionId: "s1",
        request,
        manager,
        replay,
      });

      const events = await collectSSEEvents(response);
      const parsed = parseSSEData(events);

      expect(parsed.some((e) => e.type === "error" && e.message === "Failed to load session data")).toBe(true);
    });
  });

  describe("client disconnect cleanup", () => {
    it("cleans up on client abort", async () => {
      const controller = new AbortController();
      const unsubscribe = vi.fn();
      const manager = createMockManager(true, (_cb) => {
        // Don't send terminal events — let abort do the work
        return unsubscribe;
      });
      const replay = createMockReplay();
      const request = { signal: controller.signal } as unknown as Request;

      const response = createSessionSSEResponse({
        sessionId: "s1",
        request,
        manager,
        replay,
      });

      // Start reading
      const _reader = response.body?.getReader();

      // Abort the request
      controller.abort();

      // Give cleanup time to run
      await vi.advanceTimersByTimeAsync(0);

      expect(unsubscribe).toHaveBeenCalled();
    });
  });

  describe("stream cancel cleanup", () => {
    it("marks stream as closed on cancel", async () => {
      const unsubscribe = vi.fn();
      const manager = createMockManager(true, () => unsubscribe);
      const replay = createMockReplay();
      const request = createMockRequest();

      const response = createSessionSSEResponse({
        sessionId: "s1",
        request,
        manager,
        replay,
      });

      // Cancel the body stream
      await response.body?.cancel();

      expect(unsubscribe).toHaveBeenCalled();
    });
  });
});
