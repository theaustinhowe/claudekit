import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCreateIssueComment, useIssueComments } from "@/hooks/use-issue-comments";

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

describe("useIssueComments", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches comments when enabled", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [{ id: 1, body: "A comment" }] }),
    });

    const { result } = renderHook(() => useIssueComments("repo-1", 42), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.data).toHaveLength(1);
    expect(result.current.data?.data[0].body).toBe("A comment");
  });

  it("does not fetch when repositoryId is undefined", () => {
    const { result } = renderHook(() => useIssueComments(undefined, 42), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("does not fetch when issueNumber is null", () => {
    const { result } = renderHook(() => useIssueComments("repo-1", null), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("useCreateIssueComment", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a comment", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: { id: 1, body: "New comment" } }),
    });

    const { result } = renderHook(() => useCreateIssueComment("repo-1", 42), {
      wrapper: createWrapper(),
    });

    result.current.mutate("New comment");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/repositories/repo-1/issues/42/comments"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("throws when repositoryId is undefined", async () => {
    const { result } = renderHook(() => useCreateIssueComment(undefined, 42), {
      wrapper: createWrapper(),
    });

    result.current.mutate("test");

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("repositoryId and issueNumber are required");
  });

  it("throws when issueNumber is null", async () => {
    const { result } = renderHook(() => useCreateIssueComment("repo-1", null), {
      wrapper: createWrapper(),
    });

    result.current.mutate("test");

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("repositoryId and issueNumber are required");
  });
});
