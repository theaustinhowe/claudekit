import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRepositories, useUpdateRepositorySettings } from "@/hooks/use-repositories";

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

const mockRepos = [
  {
    id: "repo-1",
    owner: "testowner",
    name: "testrepo",
    displayName: null,
    githubToken: "***",
    baseBranch: "main",
    triggerLabel: "agent",
    workdirPath: "/tmp/test",
    isActive: true,
    autoCreateJobs: true,
    removeLabelAfterCreate: false,
    pollIntervalMs: 30000,
    testCommand: null,
    agentProvider: "claude-code",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
  },
];

describe("useRepositories", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("fetches repositories successfully", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: mockRepos }),
    });

    const { result } = renderHook(() => useRepositories(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0].name).toBe("testrepo");
  });
});

describe("useUpdateRepositorySettings", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("updates repository settings", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: { pollIntervalMs: 60000, triggerLabel: "agent" },
        }),
    });

    const { result } = renderHook(() => useUpdateRepositorySettings(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({
      repositoryId: "repo-1",
      settings: { pollIntervalMs: 60000 },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/repositories/repo-1/settings"),
      expect.objectContaining({ method: "PATCH" }),
    );
  });
});
