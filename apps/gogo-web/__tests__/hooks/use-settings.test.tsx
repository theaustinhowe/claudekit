import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSettings, useUpdateSettings } from "@/hooks/use-settings";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

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

describe("useSettings", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches settings successfully", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: { maxConcurrentJobs: 3, pollingEnabled: true } }),
    });

    const { result } = renderHook(() => useSettings(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ maxConcurrentJobs: 3, pollingEnabled: true });
  });

  it("handles fetch error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const { result } = renderHook(() => useSettings(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useUpdateSettings", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("updates settings via PUT", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: { maxConcurrentJobs: 5 } }),
    });

    const { result } = renderHook(() => useUpdateSettings(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ maxConcurrentJobs: 5 });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/settings"),
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ maxConcurrentJobs: 5 }),
      }),
    );
  });

  it("handles mutation error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Server error"));

    const { result } = renderHook(() => useUpdateSettings(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ maxConcurrentJobs: 5 });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
