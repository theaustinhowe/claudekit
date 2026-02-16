import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAgentStatus, useAgents, useAllAgents } from "@/hooks/use-agents";

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

const mockAgents = [
  {
    type: "claude-code",
    displayName: "Claude Code",
    capabilities: {
      canResume: true,
      canInject: true,
      supportsStreaming: true,
    },
  },
  {
    type: "codex",
    displayName: "Codex",
    capabilities: {
      canResume: false,
      canInject: false,
      supportsStreaming: false,
    },
  },
];

describe("useAgents", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches registered agents", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: mockAgents }),
    });

    const { result } = renderHook(() => useAgents(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(2);
    expect(result.current.data?.[0].type).toBe("claude-code");
    expect(result.current.data?.[1].type).toBe("codex");
  });

  it("returns empty array when data is null", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: null }),
    });

    const { result } = renderHook(() => useAgents(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it("handles fetch error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const { result } = renderHook(() => useAgents(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useAllAgents", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches all known agents including unconfigured", async () => {
    const allAgents = [
      {
        type: "claude-code",
        displayName: "Claude Code",
        description: "Anthropic Claude agent",
        capabilities: { canResume: true, canInject: true, supportsStreaming: true },
        envVars: [],
        docsUrl: null,
        installInstructions: "npm install",
        registered: true,
        status: { available: true, configured: true, message: "Ready" },
      },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: allAgents }),
    });

    const { result } = renderHook(() => useAllAgents(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0].registered).toBe(true);
  });
});

describe("useAgentStatus", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches agent status by type", async () => {
    const status = {
      type: "claude-code",
      available: true,
      configured: true,
      registered: true,
      message: "Agent is ready",
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: status }),
    });

    const { result } = renderHook(() => useAgentStatus("claude-code"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.available).toBe(true);
    expect(result.current.data?.configured).toBe(true);
  });

  it("does not fetch when type is null", async () => {
    const { result } = renderHook(() => useAgentStatus(null), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("handles fetch error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Agent not found"));

    const { result } = renderHook(() => useAgentStatus("unknown-agent"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
