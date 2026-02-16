import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCreateIssue, useCreateJobFromIssue, useIssues } from "@/hooks/use-issues";

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

const mockIssuesResponse = {
  data: [
    {
      number: 1,
      title: "Bug report",
      body: "Something is broken",
      html_url: "https://github.com/test/repo/issues/1",
      state: "open",
      labels: [{ id: 1, name: "bug", color: "d73a4a", description: null }],
      created_at: "2024-01-01T00:00:00Z",
      user: {
        login: "testuser",
        avatar_url: "https://example.com/avatar.png",
        html_url: "https://github.com/testuser",
      },
      hasJob: false,
      jobId: null,
    },
  ],
  pagination: { page: 1, per_page: 30 },
};

describe("useIssues", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches issues for a repository", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockIssuesResponse),
    });

    const { result } = renderHook(() => useIssues("repo-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.data).toHaveLength(1);
    expect(result.current.data?.data[0].title).toBe("Bug report");
  });

  it("does not fetch when repositoryId is undefined", async () => {
    const { result } = renderHook(() => useIssues(undefined), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("does not fetch when repositoryId is 'all'", async () => {
    const { result } = renderHook(() => useIssues("all"), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("passes filter params to the API", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [], pagination: { page: 1, per_page: 10 } }),
    });

    renderHook(() => useIssues("repo-1", { state: "open", labels: "bug", per_page: 10 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("state=open");
    expect(url).toContain("labels=bug");
    expect(url).toContain("per_page=10");
  });
});

describe("useCreateIssue", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates an issue", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: { number: 42, title: "New Issue" } }),
    });

    const { result } = renderHook(() => useCreateIssue("repo-1"), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ title: "New Issue", body: "Description" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/repositories/repo-1/issues"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("throws when repositoryId is 'all'", async () => {
    const { result } = renderHook(() => useCreateIssue("all"), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ title: "New Issue" });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("Repository ID is required");
  });

  it("throws when repositoryId is undefined", async () => {
    const { result } = renderHook(() => useCreateIssue(undefined), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ title: "New Issue" });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("Repository ID is required");
  });
});

describe("useCreateJobFromIssue", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a job from an issue", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, jobId: "job-new", message: "Job created" }),
    });

    const { result } = renderHook(() => useCreateJobFromIssue("repo-1"), {
      wrapper: createWrapper(),
    });

    result.current.mutate(42);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/repositories/repo-1/issues/42/job"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("throws when repositoryId is 'all'", async () => {
    const { result } = renderHook(() => useCreateJobFromIssue("all"), {
      wrapper: createWrapper(),
    });

    result.current.mutate(1);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("Repository ID is required");
  });
});
