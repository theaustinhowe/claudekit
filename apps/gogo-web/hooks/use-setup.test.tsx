import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useBrowseDirectory,
  useCompleteSetup,
  useDiscoverRepos,
  useSetupStatus,
  useVerifyGitHub,
  useVerifyRepository,
  useVerifyWorkspace,
} from "@/hooks/use-setup";

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

describe("useSetupStatus", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches setup status", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ needsSetup: true, repositoryCount: 0 }),
    });

    const { result } = renderHook(() => useSetupStatus(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.needsSetup).toBe(true);
    expect(result.current.data?.repositoryCount).toBe(0);
  });

  it("indicates no setup needed when repos exist", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ needsSetup: false, repositoryCount: 2 }),
    });

    const { result } = renderHook(() => useSetupStatus(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.needsSetup).toBe(false);
    expect(result.current.data?.repositoryCount).toBe(2);
  });
});

describe("useVerifyGitHub", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("verifies a valid GitHub token", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: {
            username: "testuser",
            name: "Test User",
            avatarUrl: "https://example.com/avatar.png",
            scopes: ["repo", "read:org"],
            rateLimit: { limit: 5000, remaining: 4999, reset: "2024-01-01T01:00:00Z" },
          },
        }),
    });

    const { result } = renderHook(() => useVerifyGitHub(), {
      wrapper: createWrapper(),
    });

    result.current.mutate("ghp_valid_token");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.success).toBe(true);
    expect(result.current.data?.data?.username).toBe("testuser");
  });

  it("returns error for invalid token", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: false, error: "Invalid token" }),
    });

    const { result } = renderHook(() => useVerifyGitHub(), {
      wrapper: createWrapper(),
    });

    result.current.mutate("invalid_token");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.success).toBe(false);
    expect(result.current.data?.error).toBe("Invalid token");
  });
});

describe("useVerifyRepository", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("verifies repository access", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: {
            fullName: "testowner/testrepo",
            visibility: "private",
            defaultBranch: "main",
            openIssuesCount: 5,
            canPush: true,
            description: "Test repo",
          },
        }),
    });

    const { result } = renderHook(() => useVerifyRepository(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ owner: "testowner", name: "testrepo", token: "ghp_test" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.success).toBe(true);
    expect(result.current.data?.data?.canPush).toBe(true);
  });

  it("supports reuseTokenFromRepoId", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: {
            fullName: "testowner/other-repo",
            visibility: "public",
            defaultBranch: "main",
            openIssuesCount: 0,
            canPush: true,
            description: null,
          },
        }),
    });

    const { result } = renderHook(() => useVerifyRepository(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ owner: "testowner", name: "other-repo", reuseTokenFromRepoId: "repo-1" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/setup/verify-repository"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ owner: "testowner", name: "other-repo", reuseTokenFromRepoId: "repo-1" }),
      }),
    );
  });
});

describe("useVerifyWorkspace", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("verifies a workspace directory", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: { path: "/tmp/workspace", exists: true, writable: true, canCreate: true },
        }),
    });

    const { result } = renderHook(() => useVerifyWorkspace(), {
      wrapper: createWrapper(),
    });

    result.current.mutate("/tmp/workspace");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.success).toBe(true);
    expect(result.current.data?.data?.writable).toBe(true);
  });
});

describe("useCompleteSetup", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("completes the setup wizard", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: { id: "repo-1", owner: "testowner", name: "testrepo", isNew: true },
        }),
    });

    const { result } = renderHook(() => useCompleteSetup(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({
      githubToken: "ghp_test",
      owner: "testowner",
      name: "testrepo",
      triggerLabel: "agent",
      baseBranch: "main",
      workdirPath: "/tmp/work",
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/setup/complete"),
      expect.objectContaining({ method: "POST" }),
    );
  });
});

describe("useDiscoverRepos", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("discovers git repositories in a directory", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: {
            repos: [
              {
                path: "/home/user/projects/repo1",
                owner: "testowner",
                name: "repo1",
                remoteUrl: "https://github.com/testowner/repo1",
                currentBranch: "main",
              },
            ],
            scannedPath: "/home/user/projects",
          },
        }),
    });

    const { result } = renderHook(() => useDiscoverRepos(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ path: "/home/user/projects", maxDepth: 2 });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/setup/discover-repos"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ path: "/home/user/projects", maxDepth: 2 }),
      }),
    );
  });
});

describe("useBrowseDirectory", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("browses a directory for subdirectories", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: {
            path: "/home/user",
            parent: "/home",
            directories: ["projects", "documents", ".config"],
          },
        }),
    });

    const { result } = renderHook(() => useBrowseDirectory(), {
      wrapper: createWrapper(),
    });

    result.current.mutate("/home/user");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/setup/browse-directory"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ path: "/home/user" }),
      }),
    );
  });
});
