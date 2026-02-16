import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useJobAction, useJobs } from "@/hooks/use-jobs";

// Mock fetch globally
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

const mockJobsResponse = {
  data: [
    {
      id: "job-1",
      repositoryId: "repo-1",
      issueNumber: 1,
      issueUrl: "https://github.com/test/repo/issues/1",
      issueTitle: "Test Issue",
      issueBody: null,
      status: "queued",
      branch: null,
      worktreePath: null,
      prNumber: null,
      prUrl: null,
      testRetryCount: 0,
      lastTestOutput: null,
      changeSummary: null,
      pauseReason: null,
      failureReason: null,
      needsInfoQuestion: null,
      needsInfoCommentId: null,
      lastCheckedCommentId: null,
      claudeSessionId: null,
      codexSessionId: null,
      injectMode: "immediate",
      pendingInjection: null,
      processPid: null,
      processStartedAt: null,
      agentType: "claude-code",
      agentSessionData: null,
      planContent: null,
      planCommentId: null,
      lastCheckedPlanCommentId: null,
      source: "github_issue",
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    },
  ],
  pagination: { total: 1, limit: 50, offset: 0 },
};

describe("useJobs", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches jobs successfully", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockJobsResponse),
    });

    const { result } = renderHook(() => useJobs(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.data).toHaveLength(1);
    expect(result.current.data?.data[0].id).toBe("job-1");
  });

  it("passes filter params to fetch", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [],
          pagination: { total: 0, limit: 50, offset: 0 },
        }),
    });

    renderHook(() => useJobs({ status: "running", repositoryId: "repo-1" }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("status=running");
    expect(url).toContain("repositoryId=repo-1");
  });
});

describe("useJobAction", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("performs a pause action", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: { ...mockJobsResponse.data[0], status: "paused" },
        }),
    });

    const { result } = renderHook(() => useJobAction(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({
      jobId: "job-1",
      action: { type: "pause" },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/jobs/job-1/actions"),
      expect.objectContaining({ method: "POST" }),
    );
  });
});
