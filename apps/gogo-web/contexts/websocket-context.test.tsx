import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockSubscribe = vi.fn();
const mockUnsubscribe = vi.fn();
const mockTriggerReconnect = vi.fn();
let capturedMessageHandler: ((msg: unknown) => void) | undefined;

vi.mock("@/lib/ws", () => ({
  useWebSocket: (onMessage: (msg: unknown) => void) => {
    capturedMessageHandler = onMessage;
    return {
      connected: true,
      connectionState: "connected" as const,
      reconnectAttempt: 0,
      subscribe: mockSubscribe,
      unsubscribe: mockUnsubscribe,
      triggerReconnect: mockTriggerReconnect,
    };
  },
}));

const mockUpdateJobInCache = vi.fn();
const mockInvalidateJobsList = vi.fn();
const mockAppendLogToCache = vi.fn();

vi.mock("@/hooks/use-jobs", () => ({
  updateJobInCache: (...args: unknown[]) => mockUpdateJobInCache(...args),
  invalidateJobsList: (...args: unknown[]) => mockInvalidateJobsList(...args),
  appendLogToCache: (...args: unknown[]) => mockAppendLogToCache(...args),
}));

import { useWebSocketContext, WebSocketProvider } from "@/contexts/websocket-context";

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <WebSocketProvider>{children}</WebSocketProvider>
      </QueryClientProvider>
    );
  };
}

describe("WebSocketProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedMessageHandler = undefined;
  });

  afterEach(() => cleanup());

  it("provides connected state", () => {
    const { result } = renderHook(() => useWebSocketContext(), { wrapper: createWrapper() });
    expect(result.current.connected).toBe(true);
    expect(result.current.connectionState).toBe("connected");
  });

  it("subscribeToJob calls subscribe", () => {
    const { result } = renderHook(() => useWebSocketContext(), { wrapper: createWrapper() });
    result.current.subscribeToJob("job-1");
    expect(mockSubscribe).toHaveBeenCalledWith("job-1");
  });

  it("unsubscribeFromJob calls unsubscribe", () => {
    const { result } = renderHook(() => useWebSocketContext(), { wrapper: createWrapper() });
    result.current.unsubscribeFromJob("job-1");
    expect(mockUnsubscribe).toHaveBeenCalledWith("job-1");
  });

  it("handles job:updated messages by updating cache", () => {
    renderHook(() => useWebSocketContext(), { wrapper: createWrapper() });
    const job = { id: "job-1", status: "running" };
    capturedMessageHandler?.({ type: "job:updated", payload: job });
    expect(mockUpdateJobInCache).toHaveBeenCalledWith(expect.anything(), job);
  });

  it("handles job:created messages by invalidating list", () => {
    renderHook(() => useWebSocketContext(), { wrapper: createWrapper() });
    capturedMessageHandler?.({ type: "job:created", payload: { id: "job-new" } });
    expect(mockInvalidateJobsList).toHaveBeenCalled();
  });

  it("handles job:log messages for subscribed jobs", () => {
    const { result } = renderHook(() => useWebSocketContext(), { wrapper: createWrapper() });
    // Subscribe to a job first
    result.current.subscribeToJob("job-1");
    const log = { jobId: "job-1", content: "test log" };
    capturedMessageHandler?.({ type: "job:log", payload: log });
    expect(mockAppendLogToCache).toHaveBeenCalledWith(expect.anything(), "job-1", log);
  });

  it("ignores job:log messages for unsubscribed jobs", () => {
    renderHook(() => useWebSocketContext(), { wrapper: createWrapper() });
    const log = { jobId: "unsubscribed-job", content: "test log" };
    capturedMessageHandler?.({ type: "job:log", payload: log });
    expect(mockAppendLogToCache).not.toHaveBeenCalled();
  });

  it("dispatches research events as custom DOM events", () => {
    renderHook(() => useWebSocketContext(), { wrapper: createWrapper() });
    const handler = vi.fn();
    window.addEventListener("research-ws", handler);

    capturedMessageHandler?.({ type: "research:output", payload: { data: "test" } });
    expect(handler).toHaveBeenCalled();

    window.removeEventListener("research-ws", handler);
  });

  it("handles connection lifecycle events without error", () => {
    renderHook(() => useWebSocketContext(), { wrapper: createWrapper() });
    expect(() => {
      capturedMessageHandler?.({ type: "connection:established", payload: {} });
      capturedMessageHandler?.({ type: "subscribed", payload: {} });
      capturedMessageHandler?.({ type: "unsubscribed", payload: {} });
      capturedMessageHandler?.({ type: "pong", payload: {} });
    }).not.toThrow();
  });
});

describe("useWebSocketContext", () => {
  it("throws when used outside provider", () => {
    const queryClient = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    expect(() => {
      renderHook(() => useWebSocketContext(), { wrapper });
    }).toThrow("useWebSocketContext must be used within a WebSocketProvider");
  });
});
