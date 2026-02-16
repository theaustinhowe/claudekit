import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useCancelResearch,
  useConvertSuggestion,
  useResearchSession,
  useResearchSessions,
  useStartResearch,
} from "@/hooks/use-research";

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

const mockSessions = {
  data: [
    {
      id: "session-1",
      repositoryId: "repo-1",
      status: "completed",
      focusAreas: ["security", "performance"],
      claudeSessionId: "claude-123",
      processPid: null,
      output: "Analysis complete",
      suggestionCount: 3,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T01:00:00Z",
    },
  ],
};

const mockSessionDetail = {
  data: {
    id: "session-1",
    repositoryId: "repo-1",
    status: "completed",
    focusAreas: ["security"],
    claudeSessionId: "claude-123",
    processPid: null,
    output: "Analysis complete",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T01:00:00Z",
    suggestions: [
      {
        id: "sug-1",
        sessionId: "session-1",
        category: "security",
        severity: "high",
        title: "SQL Injection vulnerability",
        description: "User input is not sanitized",
        filePaths: ["src/db.ts"],
        convertedTo: null,
        convertedId: null,
        createdAt: "2024-01-01T00:30:00Z",
      },
    ],
  },
};

describe("useResearchSessions", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches research sessions", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockSessions),
    });

    const { result } = renderHook(() => useResearchSessions(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.data).toHaveLength(1);
    expect(result.current.data?.data[0].status).toBe("completed");
  });

  it("handles fetch error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const { result } = renderHook(() => useResearchSessions(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useResearchSession", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches a single research session with suggestions", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockSessionDetail),
    });

    const { result } = renderHook(() => useResearchSession("session-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.data.suggestions).toHaveLength(1);
    expect(result.current.data?.data.suggestions[0].title).toBe("SQL Injection vulnerability");
  });

  it("does not fetch when id is null", async () => {
    const { result } = renderHook(() => useResearchSession(null), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("useStartResearch", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts a research session", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: { id: "session-new", repositoryId: "repo-1", status: "running" },
        }),
    });

    const { result } = renderHook(() => useStartResearch(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ repositoryId: "repo-1", focusAreas: ["security"] });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/research/sessions"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ repositoryId: "repo-1", focusAreas: ["security"] }),
      }),
    );
  });
});

describe("useCancelResearch", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("cancels a research session", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });

    const { result } = renderHook(() => useCancelResearch(), {
      wrapper: createWrapper(),
    });

    result.current.mutate("session-1");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/research/session-1"),
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});

describe("useConvertSuggestion", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("converts a suggestion to a GitHub issue", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: { convertedTo: "github_issue", convertedId: "123" },
        }),
    });

    const { result } = renderHook(() => useConvertSuggestion(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({
      sessionId: "session-1",
      suggestionId: "sug-1",
      convertTo: "github_issue",
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/research/session-1/suggestions/sug-1/convert"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ convertTo: "github_issue" }),
      }),
    );
  });

  it("converts a suggestion to a manual job", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: { convertedTo: "manual_job", convertedId: "job-new" },
        }),
    });

    const { result } = renderHook(() => useConvertSuggestion(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({
      sessionId: "session-1",
      suggestionId: "sug-2",
      convertTo: "manual_job",
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/research/session-1/suggestions/sug-2/convert"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ convertTo: "manual_job" }),
      }),
    );
  });
});
