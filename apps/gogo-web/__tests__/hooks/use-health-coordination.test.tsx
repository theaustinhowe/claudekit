import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useHealthCoordination } from "@/hooks/use-health-coordination";

const mockNotifyBackendAvailable = vi.fn();
let mockConnectionState = "connected";

vi.mock("@/contexts/websocket-context", () => ({
  useWebSocketContext: () => ({
    connectionState: mockConnectionState,
    notifyBackendAvailable: mockNotifyBackendAvailable,
  }),
}));

const mockHealthData = { status: "ok", uptime: 1000 };
let mockHealthError = false;

vi.mock("@/hooks/use-jobs", () => ({
  useHealth: () => ({
    data: mockHealthData,
    isError: mockHealthError,
  }),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("useHealthCoordination", () => {
  beforeEach(() => {
    mockNotifyBackendAvailable.mockReset();
    mockConnectionState = "connected";
    mockHealthData.status = "ok";
    mockHealthError = false;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not notify on initial healthy state", () => {
    renderHook(() => useHealthCoordination(), {
      wrapper: createWrapper(),
    });

    expect(mockNotifyBackendAvailable).not.toHaveBeenCalled();
  });

  it("notifies when backend recovers from unhealthy to healthy", async () => {
    mockHealthData.status = "error";
    mockHealthError = true;

    const { rerender } = renderHook(() => useHealthCoordination(), {
      wrapper: createWrapper(),
    });

    mockHealthData.status = "ok";
    mockHealthError = false;

    rerender();

    await waitFor(() => {
      expect(mockNotifyBackendAvailable).toHaveBeenCalled();
    });
  });

  it("notifies when websocket disconnects but backend is healthy", async () => {
    mockConnectionState = "connected";

    const { rerender } = renderHook(() => useHealthCoordination(), {
      wrapper: createWrapper(),
    });

    mockConnectionState = "disconnected";

    rerender();

    await waitFor(() => {
      expect(mockNotifyBackendAvailable).toHaveBeenCalled();
    });
  });

  it("does not notify when both health and ws are stable", () => {
    mockConnectionState = "connected";
    mockHealthData.status = "ok";

    renderHook(() => useHealthCoordination(), {
      wrapper: createWrapper(),
    });

    expect(mockNotifyBackendAvailable).not.toHaveBeenCalled();
  });
});
