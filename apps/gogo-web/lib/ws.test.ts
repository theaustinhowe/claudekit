import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Mock WebSocket ---

let mockInstances: MockWebSocket[] = [];

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  url: string;
  readyState = MockWebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  send = vi.fn();
  close = vi.fn().mockImplementation(() => {
    this.readyState = MockWebSocket.CLOSED;
  });

  constructor(url: string) {
    this.url = url;
    mockInstances.push(this);
  }

  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.(new Event("open"));
  }

  simulateClose(code = 1000) {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code } as CloseEvent);
  }

  simulateMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent);
  }

  simulateError() {
    this.onerror?.(new Event("error"));
  }
}

vi.stubGlobal("WebSocket", MockWebSocket);

// Mock localStorage
const localStorageMock: Record<string, string> = {};
vi.stubGlobal("localStorage", {
  getItem: vi.fn((key: string) => localStorageMock[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    localStorageMock[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete localStorageMock[key];
  }),
});

// Import after mocks
import { useWebSocket } from "@/lib/ws";

describe("getWsUrl (via useWebSocket connection)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockInstances = [];
    for (const key of Object.keys(localStorageMock)) delete localStorageMock[key];
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("uses NEXT_PUBLIC_WS_URL env var when set", () => {
    vi.stubEnv("NEXT_PUBLIC_WS_URL", "wss://custom-host/ws");

    const onMessage = vi.fn();
    const { unmount } = renderHook(() => useWebSocket(onMessage));

    expect(mockInstances.length).toBeGreaterThanOrEqual(1);
    expect(mockInstances[0].url).toBe("wss://custom-host/ws");
    unmount();
  });

  it("derives URL from window.location when no env var", () => {
    // window.location is set by jsdom to about:blank / localhost
    const onMessage = vi.fn();
    const { unmount } = renderHook(() => useWebSocket(onMessage));

    expect(mockInstances.length).toBeGreaterThanOrEqual(1);
    const url = mockInstances[0].url;
    expect(url).toContain("ws:");
    expect(url).toContain("2201/ws");
    unmount();
  });

  it("appends auth token from localStorage", () => {
    localStorageMock.gogo_api_token = "my-secret-token";
    const onMessage = vi.fn();
    const { unmount } = renderHook(() => useWebSocket(onMessage));

    expect(mockInstances[0].url).toContain("token=my-secret-token");
    unmount();
  });

  it("uses custom orchestrator port from env", () => {
    vi.stubEnv("NEXT_PUBLIC_ORCHESTRATOR_PORT", "9999");
    const onMessage = vi.fn();
    const { unmount } = renderHook(() => useWebSocket(onMessage));

    expect(mockInstances[0].url).toContain("9999/ws");
    unmount();
  });
});

describe("useWebSocket", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockInstances = [];
    for (const key of Object.keys(localStorageMock)) delete localStorageMock[key];
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("starts disconnected then connects", () => {
    const onMessage = vi.fn();
    const { result, unmount } = renderHook(() => useWebSocket(onMessage));

    // Initial state before open
    expect(result.current.connected).toBe(false);

    // Simulate WebSocket open
    act(() => {
      mockInstances[0].simulateOpen();
    });

    expect(result.current.connected).toBe(true);
    expect(result.current.connectionState).toBe("connected");
    unmount();
  });

  it("parses incoming messages and passes to callback", () => {
    const onMessage = vi.fn();
    const { unmount } = renderHook(() => useWebSocket(onMessage));

    act(() => {
      mockInstances[0].simulateOpen();
    });

    act(() => {
      mockInstances[0].simulateMessage({ type: "job:updated", payload: { id: "123" } });
    });

    expect(onMessage).toHaveBeenCalledWith({ type: "job:updated", payload: { id: "123" } });
    unmount();
  });

  it("tracks subscriptions and sends subscribe messages", () => {
    const onMessage = vi.fn();
    const { result, unmount } = renderHook(() => useWebSocket(onMessage));

    act(() => {
      mockInstances[0].simulateOpen();
    });

    act(() => {
      result.current.subscribe("job-1");
    });

    expect(mockInstances[0].send).toHaveBeenCalledWith(
      JSON.stringify({ type: "subscribe", payload: { jobId: "job-1" } }),
    );
    unmount();
  });

  it("sends unsubscribe messages", () => {
    const onMessage = vi.fn();
    const { result, unmount } = renderHook(() => useWebSocket(onMessage));

    act(() => {
      mockInstances[0].simulateOpen();
    });

    act(() => {
      result.current.subscribe("job-1");
      result.current.unsubscribe("job-1");
    });

    expect(mockInstances[0].send).toHaveBeenCalledWith(
      JSON.stringify({ type: "unsubscribe", payload: { jobId: "job-1" } }),
    );
    unmount();
  });

  it("re-subscribes on reconnect", () => {
    const onMessage = vi.fn();
    const { result, unmount } = renderHook(() => useWebSocket(onMessage));

    act(() => {
      mockInstances[0].simulateOpen();
    });

    // Subscribe to a job
    act(() => {
      result.current.subscribe("job-1");
    });

    // Simulate disconnect
    act(() => {
      mockInstances[0].simulateClose();
    });

    // Advance past reconnect delay (1s initial)
    act(() => {
      vi.advanceTimersByTime(1100);
    });

    // New WebSocket instance should have been created
    const newWs = mockInstances[mockInstances.length - 1];
    act(() => {
      newWs.simulateOpen();
    });

    // Should have re-subscribed to job-1
    expect(newWs.send).toHaveBeenCalledWith(JSON.stringify({ type: "subscribe", payload: { jobId: "job-1" } }));
    unmount();
  });

  it("sends ping messages", () => {
    const onMessage = vi.fn();
    const { result, unmount } = renderHook(() => useWebSocket(onMessage));

    act(() => {
      mockInstances[0].simulateOpen();
    });

    act(() => {
      result.current.ping();
    });

    expect(mockInstances[0].send).toHaveBeenCalledWith(JSON.stringify({ type: "ping" }));
    unmount();
  });

  it("reconnects with exponential backoff", () => {
    const onMessage = vi.fn();
    const { result, unmount } = renderHook(() => useWebSocket(onMessage));

    act(() => {
      mockInstances[0].simulateOpen();
    });

    // First disconnect
    act(() => {
      mockInstances[0].simulateClose();
    });

    expect(result.current.connectionState).toBe("reconnecting");
    expect(result.current.reconnectAttempt).toBe(1);

    // Advance past first reconnect (1s)
    act(() => {
      vi.advanceTimersByTime(1100);
    });

    // Should have created a new WebSocket
    expect(mockInstances.length).toBe(2);

    // Simulate second close (reconnect fails)
    act(() => {
      mockInstances[1].simulateClose();
    });

    expect(result.current.reconnectAttempt).toBe(2);

    // Second reconnect should take 2s (backoff)
    act(() => {
      vi.advanceTimersByTime(2100);
    });

    expect(mockInstances.length).toBe(3);
    unmount();
  });

  it("enters failed state after max reconnect attempts", () => {
    const onMessage = vi.fn();
    const { result, unmount } = renderHook(() => useWebSocket(onMessage));

    act(() => {
      mockInstances[0].simulateOpen();
    });

    // Exhaust all reconnect attempts (MAX_RECONNECT_ATTEMPTS = 10)
    for (let i = 0; i < 11; i++) {
      act(() => {
        mockInstances[mockInstances.length - 1].simulateClose();
      });
      act(() => {
        vi.advanceTimersByTime(35000); // Advance past max delay
      });
    }

    expect(result.current.connectionState).toBe("failed");
    unmount();
  });

  it("does not reconnect on manual close (unmount)", () => {
    const onMessage = vi.fn();
    const { unmount } = renderHook(() => useWebSocket(onMessage));

    act(() => {
      mockInstances[0].simulateOpen();
    });

    const instanceCountBefore = mockInstances.length;

    // Unmount triggers manual close
    unmount();

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    // No new connections should have been attempted
    expect(mockInstances.length).toBe(instanceCountBefore);
  });

  it("triggerReconnect resets backoff and reconnects", () => {
    const onMessage = vi.fn();
    const { result, unmount } = renderHook(() => useWebSocket(onMessage));

    act(() => {
      mockInstances[0].simulateOpen();
    });

    // Disconnect and let a few reconnect attempts fail
    act(() => {
      mockInstances[0].simulateClose();
    });
    act(() => {
      vi.advanceTimersByTime(1100);
    });
    act(() => {
      mockInstances[1].simulateClose();
    });

    const countBefore = mockInstances.length;

    // Manual reconnect trigger
    act(() => {
      result.current.triggerReconnect();
    });

    expect(mockInstances.length).toBeGreaterThan(countBefore);
    expect(result.current.reconnectAttempt).toBe(0);
    unmount();
  });

  it("triggerReconnect is no-op when already connected", () => {
    const onMessage = vi.fn();
    const { result, unmount } = renderHook(() => useWebSocket(onMessage));

    act(() => {
      mockInstances[0].simulateOpen();
    });

    const countBefore = mockInstances.length;

    act(() => {
      result.current.triggerReconnect();
    });

    // No new WebSocket should have been created
    expect(mockInstances.length).toBe(countBefore);
    unmount();
  });

  it("cleans up on unmount", () => {
    const onMessage = vi.fn();
    const { unmount } = renderHook(() => useWebSocket(onMessage));

    act(() => {
      mockInstances[0].simulateOpen();
    });

    unmount();

    expect(mockInstances[0].close).toHaveBeenCalled();
  });

  it("handles invalid JSON messages gracefully", () => {
    const onMessage = vi.fn();
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { unmount } = renderHook(() => useWebSocket(onMessage));

    act(() => {
      mockInstances[0].simulateOpen();
    });

    act(() => {
      mockInstances[0].onmessage?.({ data: "not json" } as MessageEvent);
    });

    expect(onMessage).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
    unmount();
  });

  it("handles WebSocket error event gracefully", () => {
    const onMessage = vi.fn();
    const { result, unmount } = renderHook(() => useWebSocket(onMessage));

    act(() => {
      mockInstances[0].simulateOpen();
    });

    // Error should not crash - close event will handle reconnection
    act(() => {
      mockInstances[0].simulateError();
    });

    expect(result.current.connected).toBe(true);
    unmount();
  });

  it("does not send messages when WebSocket is not open", () => {
    const onMessage = vi.fn();
    const { result, unmount } = renderHook(() => useWebSocket(onMessage));

    // WebSocket is still CONNECTING, not OPEN
    act(() => {
      result.current.subscribe("job-1");
    });

    // Should not have attempted to send
    expect(mockInstances[0].send).not.toHaveBeenCalled();
    unmount();
  });

  it("doubles backoff delay on successive reconnection attempts", () => {
    const onMessage = vi.fn();
    const { unmount } = renderHook(() => useWebSocket(onMessage));

    act(() => {
      mockInstances[0].simulateOpen();
    });

    // First disconnect -> 1s backoff
    act(() => {
      mockInstances[0].simulateClose();
    });

    // After 1s, first reconnect
    act(() => {
      vi.advanceTimersByTime(1100);
    });
    expect(mockInstances.length).toBe(2);

    // Second disconnect -> 2s backoff (doubled)
    act(() => {
      mockInstances[1].simulateClose();
    });

    // After 1.5s, should NOT have reconnected yet (backoff is 2s)
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(mockInstances.length).toBe(2);

    // After another 600ms (total 2.1s), should have reconnected
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(mockInstances.length).toBe(3);

    // Third disconnect -> 4s backoff (doubled again)
    act(() => {
      mockInstances[2].simulateClose();
    });

    act(() => {
      vi.advanceTimersByTime(3500);
    });
    expect(mockInstances.length).toBe(3); // Should NOT have reconnected yet

    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(mockInstances.length).toBe(4); // Now should have reconnected

    unmount();
  });

  it("triggerReconnect from failed state resets and reconnects", () => {
    const onMessage = vi.fn();
    const { result, unmount } = renderHook(() => useWebSocket(onMessage));

    act(() => {
      mockInstances[0].simulateOpen();
    });

    // Exhaust all reconnect attempts
    for (let i = 0; i < 11; i++) {
      act(() => {
        mockInstances[mockInstances.length - 1].simulateClose();
      });
      act(() => {
        vi.advanceTimersByTime(35000);
      });
    }

    expect(result.current.connectionState).toBe("failed");

    const countBefore = mockInstances.length;

    // Manual trigger should reset and reconnect
    act(() => {
      result.current.triggerReconnect();
    });

    expect(mockInstances.length).toBeGreaterThan(countBefore);
    expect(result.current.reconnectAttempt).toBe(0);

    unmount();
  });
});
