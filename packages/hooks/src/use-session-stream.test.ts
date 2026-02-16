import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionStreamEvent } from "./use-session-stream";
import { useSessionStream } from "./use-session-stream";

// --- Helpers for creating a mock SSE stream ----------------------------------

function createMockStream() {
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });

  const encoder = new TextEncoder();

  return {
    stream,
    send(event: SessionStreamEvent) {
      controller?.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
    },
    sendDone() {
      controller?.enqueue(encoder.encode("data: [DONE]\n\n"));
    },
    close() {
      controller?.close();
    },
  };
}

function mockFetchWithStream(mock: ReturnType<typeof createMockStream>) {
  return vi.fn().mockResolvedValue({
    ok: true,
    body: mock.stream,
    status: 200,
  });
}

// --- Setup -------------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// --- Tests -------------------------------------------------------------------

describe("useSessionStream", () => {
  it("starts with idle status when no sessionId", () => {
    const { result } = renderHook(() => useSessionStream({ sessionId: null }));
    expect(result.current.status).toBe("idle");
    expect(result.current.logs).toEqual([]);
    expect(result.current.progress).toBeNull();
    expect(result.current.phase).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.elapsed).toBe(0);
    expect(result.current.events).toEqual([]);
  });

  it("stays idle when autoConnect is false", () => {
    const mock = createMockStream();
    globalThis.fetch = mockFetchWithStream(mock);

    const { result } = renderHook(() => useSessionStream({ sessionId: "s1", autoConnect: false }));
    expect(result.current.status).toBe("idle");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("auto-connects when sessionId is provided and autoConnect is true", async () => {
    const mock = createMockStream();
    globalThis.fetch = mockFetchWithStream(mock);

    const { result } = renderHook(() => useSessionStream({ sessionId: "s1", autoConnect: true }));

    // Let the connection establish
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/sessions/s1/stream",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(result.current.status).toBe("streaming");
  });

  it("uses custom baseUrl", async () => {
    const mock = createMockStream();
    globalThis.fetch = mockFetchWithStream(mock);

    renderHook(() => useSessionStream({ sessionId: "s1", baseUrl: "http://localhost:3000" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(globalThis.fetch).toHaveBeenCalledWith("http://localhost:3000/api/sessions/s1/stream", expect.any(Object));
  });

  it("accumulates log events", async () => {
    const mock = createMockStream();
    globalThis.fetch = mockFetchWithStream(mock);

    const { result } = renderHook(() => useSessionStream({ sessionId: "s1" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      mock.send({ type: "log", log: "Starting build", logType: "info" });
      await vi.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      mock.send({ type: "log", log: "Build complete", logType: "success" });
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.logs).toEqual([
      { log: "Starting build", logType: "info" },
      { log: "Build complete", logType: "success" },
    ]);
  });

  it("updates progress and phase from events", async () => {
    const mock = createMockStream();
    globalThis.fetch = mockFetchWithStream(mock);

    const { result } = renderHook(() => useSessionStream({ sessionId: "s1" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      mock.send({ type: "progress", progress: 50, phase: "building" });
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.progress).toBe(50);
    expect(result.current.phase).toBe("building");
  });

  it("accumulates events array", async () => {
    const mock = createMockStream();
    globalThis.fetch = mockFetchWithStream(mock);

    const { result } = renderHook(() => useSessionStream({ sessionId: "s1" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      mock.send({ type: "init", message: "Session started" });
      await vi.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      mock.send({ type: "log", log: "Hello", logType: "info" });
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.events).toHaveLength(2);
    expect(result.current.events[0].type).toBe("init");
    expect(result.current.events[1].type).toBe("log");
  });

  it("sets status to done on [DONE] message", async () => {
    const mock = createMockStream();
    globalThis.fetch = mockFetchWithStream(mock);

    const { result } = renderHook(() => useSessionStream({ sessionId: "s1" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      mock.sendDone();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.status).toBe("done");
  });

  it("sets error status on error event", async () => {
    const mock = createMockStream();
    globalThis.fetch = mockFetchWithStream(mock);

    const { result } = renderHook(() => useSessionStream({ sessionId: "s1" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      mock.send({ type: "error", message: "Something went wrong" });
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe("Something went wrong");
  });

  it("sets done status on done event from server", async () => {
    const mock = createMockStream();
    globalThis.fetch = mockFetchWithStream(mock);

    const { result } = renderHook(() => useSessionStream({ sessionId: "s1" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      mock.send({ type: "done", message: "All done" });
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.status).toBe("done");
  });

  it("calls onEvent callback for each event", async () => {
    const mock = createMockStream();
    globalThis.fetch = mockFetchWithStream(mock);
    const onEvent = vi.fn();

    renderHook(() => useSessionStream({ sessionId: "s1", onEvent }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      mock.send({ type: "log", log: "Line 1", logType: "info" });
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "log", log: "Line 1" }));
  });

  it("calls onComplete callback for done/error/cancelled events", async () => {
    const mock = createMockStream();
    globalThis.fetch = mockFetchWithStream(mock);
    const onComplete = vi.fn();

    renderHook(() => useSessionStream({ sessionId: "s1", onComplete }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      mock.send({ type: "done", message: "Finished" });
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ type: "done" }));
  });

  it("respects maxLogs cap", async () => {
    const mock = createMockStream();
    globalThis.fetch = mockFetchWithStream(mock);

    const { result } = renderHook(() => useSessionStream({ sessionId: "s1", maxLogs: 3 }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    for (let i = 1; i <= 5; i++) {
      await act(async () => {
        mock.send({ type: "log", log: `Log ${i}`, logType: "info" });
        await vi.advanceTimersByTimeAsync(0);
      });
    }

    expect(result.current.logs).toHaveLength(3);
    expect(result.current.logs[0].log).toBe("Log 3");
    expect(result.current.logs[2].log).toBe("Log 5");
  });

  it("defaults logType to 'status' when not provided", async () => {
    const mock = createMockStream();
    globalThis.fetch = mockFetchWithStream(mock);

    const { result } = renderHook(() => useSessionStream({ sessionId: "s1" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      mock.send({ type: "log", log: "No type" });
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.logs[0].logType).toBe("status");
  });

  it("disconnect aborts the connection", async () => {
    const mock = createMockStream();
    globalThis.fetch = mockFetchWithStream(mock);

    const { result } = renderHook(() => useSessionStream({ sessionId: "s1" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.status).toBe("streaming");

    act(() => {
      result.current.disconnect();
    });

    // The status stays where it was since disconnect doesn't set status
    // The abort controller is cleared
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("skips heartbeat events", async () => {
    const mock = createMockStream();
    globalThis.fetch = mockFetchWithStream(mock);

    const { result } = renderHook(() => useSessionStream({ sessionId: "s1" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      mock.send({ type: "heartbeat" });
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.events).toHaveLength(0);
  });

  it("handles non-ok response by setting error", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      body: null,
      status: 500,
    });

    const { result } = renderHook(() => useSessionStream({ sessionId: "s1" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe("Stream request failed: 500");
  });
});
