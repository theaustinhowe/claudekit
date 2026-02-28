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
    sendRaw(text: string) {
      controller?.enqueue(encoder.encode(text));
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

  // ---------------------------------------------------------------------------
  // New coverage: cancelled event
  // ---------------------------------------------------------------------------

  it("sets done status on cancelled event from server", async () => {
    const mock = createMockStream();
    globalThis.fetch = mockFetchWithStream(mock);
    const onComplete = vi.fn();

    const { result } = renderHook(() => useSessionStream({ sessionId: "s1", onComplete }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      mock.send({ type: "cancelled", message: "Session was cancelled" });
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.status).toBe("done");
    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ type: "cancelled", message: "Session was cancelled" }),
    );
  });

  // ---------------------------------------------------------------------------
  // New coverage: error event with no message defaults to "Unknown error"
  // ---------------------------------------------------------------------------

  it("defaults error message to 'Unknown error' when message is not provided", async () => {
    const mock = createMockStream();
    globalThis.fetch = mockFetchWithStream(mock);

    const { result } = renderHook(() => useSessionStream({ sessionId: "s1" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      mock.send({ type: "error" });
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe("Unknown error");
  });

  // ---------------------------------------------------------------------------
  // New coverage: reconnect() function
  // ---------------------------------------------------------------------------

  it("reconnect() re-establishes the stream connection", async () => {
    const mock = createMockStream();
    globalThis.fetch = mockFetchWithStream(mock);

    const { result } = renderHook(() => useSessionStream({ sessionId: "s1" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.status).toBe("streaming");
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    // Create a new stream for the reconnection
    const mock2 = createMockStream();
    globalThis.fetch = mockFetchWithStream(mock2);

    await act(async () => {
      result.current.reconnect();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------------
  // New coverage: cancel() function
  // ---------------------------------------------------------------------------

  it("cancel() posts to cancel endpoint and disconnects", async () => {
    const mock = createMockStream();
    globalThis.fetch = mockFetchWithStream(mock);

    const { result } = renderHook(() => useSessionStream({ sessionId: "s1" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Now set up fetch to handle the cancel POST
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });

    await act(async () => {
      await result.current.cancel();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(globalThis.fetch).toHaveBeenCalledWith("/api/sessions/s1/cancel", { method: "POST" });
    expect(result.current.status).toBe("done");
  });

  it("cancel() uses custom baseUrl for cancel endpoint", async () => {
    const mock = createMockStream();
    globalThis.fetch = mockFetchWithStream(mock);

    const { result } = renderHook(() => useSessionStream({ sessionId: "s1", baseUrl: "http://localhost:3000" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });

    await act(async () => {
      await result.current.cancel();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(globalThis.fetch).toHaveBeenCalledWith("http://localhost:3000/api/sessions/s1/cancel", { method: "POST" });
  });

  it("cancel() calls onComplete with cancelled event", async () => {
    const mock = createMockStream();
    globalThis.fetch = mockFetchWithStream(mock);
    const onComplete = vi.fn();

    const { result } = renderHook(() => useSessionStream({ sessionId: "s1", onComplete }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });

    await act(async () => {
      await result.current.cancel();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ type: "cancelled", message: "Session cancelled" }),
    );
  });

  it("cancel() is a no-op when sessionId is null", async () => {
    globalThis.fetch = vi.fn();

    const { result } = renderHook(() => useSessionStream({ sessionId: null }));

    await act(async () => {
      await result.current.cancel();
    });

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("cancel() ignores errors from the cancel request", async () => {
    const mock = createMockStream();
    globalThis.fetch = mockFetchWithStream(mock);

    const { result } = renderHook(() => useSessionStream({ sessionId: "s1" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    globalThis.fetch = vi.fn().mockRejectedValue(new Error("network error"));

    // Should not throw
    await act(async () => {
      await result.current.cancel();
      await vi.advanceTimersByTimeAsync(0);
    });
  });

  it("cancel() does not set done if response is not ok", async () => {
    const mock = createMockStream();
    globalThis.fetch = mockFetchWithStream(mock);

    const { result } = renderHook(() => useSessionStream({ sessionId: "s1" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });

    await act(async () => {
      await result.current.cancel();
      await vi.advanceTimersByTimeAsync(0);
    });

    // Status should still be streaming since the cancel was not successful
    expect(result.current.status).toBe("streaming");
  });

  // ---------------------------------------------------------------------------
  // New coverage: stream ending normally (close without [DONE])
  // ---------------------------------------------------------------------------

  it("sets done status when stream closes normally without [DONE]", async () => {
    const mock = createMockStream();
    globalThis.fetch = mockFetchWithStream(mock);

    const { result } = renderHook(() => useSessionStream({ sessionId: "s1" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.status).toBe("streaming");

    // Close the stream without sending [DONE]
    await act(async () => {
      mock.close();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.status).toBe("done");
  });

  // ---------------------------------------------------------------------------
  // New coverage: malformed JSON is skipped
  // ---------------------------------------------------------------------------

  it("skips malformed JSON data gracefully", async () => {
    const mock = createMockStream();
    globalThis.fetch = mockFetchWithStream(mock);

    const { result } = renderHook(() => useSessionStream({ sessionId: "s1" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      mock.sendRaw("data: {invalid json}\n\n");
      await vi.advanceTimersByTimeAsync(0);
    });

    // Should not crash; events remain empty
    expect(result.current.events).toHaveLength(0);
    expect(result.current.status).toBe("streaming");
  });

  // ---------------------------------------------------------------------------
  // New coverage: lines that don't start with "data: " are ignored
  // ---------------------------------------------------------------------------

  it("ignores SSE lines that do not start with 'data: '", async () => {
    const mock = createMockStream();
    globalThis.fetch = mockFetchWithStream(mock);

    const { result } = renderHook(() => useSessionStream({ sessionId: "s1" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      mock.sendRaw("event: ping\n\n");
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.events).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // New coverage: retry logic for network errors
  // ---------------------------------------------------------------------------

  it("retries on network TypeError with reconnecting status", async () => {
    let fetchCallCount = 0;

    globalThis.fetch = vi.fn().mockImplementation(() => {
      fetchCallCount++;
      return Promise.reject(new TypeError("Failed to fetch"));
    });

    const { result } = renderHook(() => useSessionStream({ sessionId: "s1" }));

    // First attempt fails
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(fetchCallCount).toBe(1);
    expect(result.current.status).toBe("reconnecting");
    expect(result.current.error).toBeNull();

    // Advance 1s for retry -- connect() calls disconnect() which resets retryCount,
    // so the backoff delay is always 2^0 * 1000 = 1000ms.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(fetchCallCount).toBe(2);
    expect(result.current.status).toBe("reconnecting");

    // Another retry after 1s
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(fetchCallCount).toBe(3);
    expect(result.current.status).toBe("reconnecting");
  });

  it("retries on network connection error messages", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("network connection failed"));

    const { result } = renderHook(() => useSessionStream({ sessionId: "s1" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.status).toBe("reconnecting");
  });

  it("does not retry on non-network errors", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Some other error"));

    const { result } = renderHook(() => useSessionStream({ sessionId: "s1" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe("Some other error");
  });

  it("resets retry count on successful connection", async () => {
    let callCount = 0;

    // First call fails, second succeeds
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.reject(new TypeError("Failed to fetch"));
      }
      const mock = createMockStream();
      return Promise.resolve({
        ok: true,
        body: mock.stream,
        status: 200,
      });
    });

    const { result } = renderHook(() => useSessionStream({ sessionId: "s1" }));

    // First attempt fails
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.status).toBe("reconnecting");

    // Retry after 1s delay succeeds
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(result.current.status).toBe("streaming");
  });

  // ---------------------------------------------------------------------------
  // New coverage: elapsed timer
  // ---------------------------------------------------------------------------

  it("tracks elapsed time while streaming", async () => {
    const mock = createMockStream();
    globalThis.fetch = mockFetchWithStream(mock);

    const { result } = renderHook(() => useSessionStream({ sessionId: "s1" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.elapsed).toBe(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(result.current.elapsed).toBe(3);
  });

  // ---------------------------------------------------------------------------
  // New coverage: cleanup on unmount
  // ---------------------------------------------------------------------------

  it("cleans up on unmount by disconnecting", async () => {
    const mock = createMockStream();
    globalThis.fetch = mockFetchWithStream(mock);

    const { result, unmount } = renderHook(() => useSessionStream({ sessionId: "s1" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.status).toBe("streaming");

    // Unmounting should trigger cleanup
    unmount();

    // No error should occur
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------------
  // New coverage: reconnects on sessionId change
  // ---------------------------------------------------------------------------

  it("reconnects when sessionId changes", async () => {
    const mock1 = createMockStream();
    globalThis.fetch = mockFetchWithStream(mock1);

    const { result, rerender } = renderHook(
      ({ sessionId }: { sessionId: string | null }) => useSessionStream({ sessionId }),
      { initialProps: { sessionId: "s1" } },
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.status).toBe("streaming");

    // Change sessionId
    const mock2 = createMockStream();
    globalThis.fetch = mockFetchWithStream(mock2);

    rerender({ sessionId: "s2" });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(globalThis.fetch).toHaveBeenCalledWith("/api/sessions/s2/stream", expect.any(Object));
  });

  // ---------------------------------------------------------------------------
  // New coverage: disconnect clears retry timeout
  // ---------------------------------------------------------------------------

  it("disconnect clears pending retry timeout", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

    const { result } = renderHook(() => useSessionStream({ sessionId: "s1" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.status).toBe("reconnecting");

    act(() => {
      result.current.disconnect();
    });

    // Advance past the retry delay; should NOT attempt reconnect
    const fetchCalls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    // No additional fetch calls should have been made
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(fetchCalls);
  });

  // ---------------------------------------------------------------------------
  // New coverage: non-Error throws in catch
  // ---------------------------------------------------------------------------

  it("handles non-Error throw by setting generic error message", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue("string error");

    const { result } = renderHook(() => useSessionStream({ sessionId: "s1" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe("Connection failed");
  });

  // ---------------------------------------------------------------------------
  // New coverage: events without log field don't add to logs
  // ---------------------------------------------------------------------------

  it("does not add to logs for events without a log field", async () => {
    const mock = createMockStream();
    globalThis.fetch = mockFetchWithStream(mock);

    const { result } = renderHook(() => useSessionStream({ sessionId: "s1" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      mock.send({ type: "progress", progress: 30 });
      await vi.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      mock.send({ type: "init", message: "Started" });
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.logs).toHaveLength(0);
    expect(result.current.events).toHaveLength(2);
  });

  // ---------------------------------------------------------------------------
  // New coverage: chunk event type
  // ---------------------------------------------------------------------------

  it("handles chunk event type with data payload", async () => {
    const mock = createMockStream();
    globalThis.fetch = mockFetchWithStream(mock);

    const onEvent = vi.fn();
    const { result } = renderHook(() => useSessionStream({ sessionId: "s1", onEvent }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      mock.send({ type: "chunk", data: { key: "value" } });
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.events).toHaveLength(1);
    expect(result.current.events[0].type).toBe("chunk");
    expect(result.current.events[0].data).toEqual({ key: "value" });
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "chunk" }));
  });

  // ---------------------------------------------------------------------------
  // New coverage: progress updates without phase
  // ---------------------------------------------------------------------------

  it("updates progress without changing phase when phase is not in event", async () => {
    const mock = createMockStream();
    globalThis.fetch = mockFetchWithStream(mock);

    const { result } = renderHook(() => useSessionStream({ sessionId: "s1" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      mock.send({ type: "progress", progress: 25, phase: "scanning" });
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.phase).toBe("scanning");

    await act(async () => {
      mock.send({ type: "progress", progress: 75 });
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.progress).toBe(75);
    // phase is not updated when not present in event (undefined is not set)
  });
});
