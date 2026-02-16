import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCleanupWorktree, useWorktrees } from "@/hooks/use-worktrees";

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

const mockWorktrees = {
  data: [
    {
      path: "/tmp/worktrees/issue-1",
      branch: "gogo/issue-1",
      commit: "abc123",
      job: {
        id: "job-1",
        issueNumber: 1,
        issueTitle: "Fix bug",
        status: "running",
        prNumber: null,
        prUrl: null,
        updatedAt: "2024-01-01T00:00:00Z",
      },
      repository: {
        id: "repo-1",
        owner: "testowner",
        name: "testrepo",
        displayName: null,
      },
    },
  ],
};

describe("useWorktrees", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches worktrees successfully", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockWorktrees),
    });

    const { result } = renderHook(() => useWorktrees(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.data).toHaveLength(1);
    expect(result.current.data?.data[0].path).toBe("/tmp/worktrees/issue-1");
    expect(result.current.data?.data[0].branch).toBe("gogo/issue-1");
  });

  it("handles empty worktree list", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
    });

    const { result } = renderHook(() => useWorktrees(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.data).toHaveLength(0);
  });

  it("handles fetch error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const { result } = renderHook(() => useWorktrees(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useCleanupWorktree", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends cleanup request for a worktree", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          cleaned: {
            worktreePath: "/tmp/worktrees/issue-1",
            jobsDir: "/tmp/jobs/issue-1",
          },
        }),
    });

    const { result } = renderHook(() => useCleanupWorktree(), {
      wrapper: createWrapper(),
    });

    result.current.mutate("job-1");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/worktrees/job-1/cleanup"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("handles cleanup error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Cleanup failed"));

    const { result } = renderHook(() => useCleanupWorktree(), {
      wrapper: createWrapper(),
    });

    result.current.mutate("job-1");

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
