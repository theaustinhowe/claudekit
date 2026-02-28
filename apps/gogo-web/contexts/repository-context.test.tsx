import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RepositoryProvider, useRepositoryContext } from "@/contexts/repository-context";
import type { RepositoryInfo } from "@/lib/api";

const mockLocalStorage: Record<string, string> = {};

beforeEach(() => {
  Object.defineProperty(window, "localStorage", {
    value: {
      getItem: vi.fn((key: string) => mockLocalStorage[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        mockLocalStorage[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete mockLocalStorage[key];
      }),
    },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  for (const key of Object.keys(mockLocalStorage)) {
    delete mockLocalStorage[key];
  }
  vi.restoreAllMocks();
});

function makeRepo(overrides: Partial<RepositoryInfo> & { id: string }): RepositoryInfo {
  return {
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
    pollIntervalMs: null,
    testCommand: null,
    agentProvider: null,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function createWrapper(repos: RepositoryInfo[], isLoading = false) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <RepositoryProvider repositories={repos} isLoading={isLoading}>
        {children}
      </RepositoryProvider>
    );
  };
}

describe("useRepositoryContext", () => {
  it("throws when used outside RepositoryProvider", () => {
    expect(() => {
      renderHook(() => useRepositoryContext());
    }).toThrow("useRepositoryContext must be used within a RepositoryProvider");
  });
});

describe("RepositoryProvider", () => {
  it("provides repositories to context consumers", () => {
    const repos = [makeRepo({ id: "repo-1" }), makeRepo({ id: "repo-2", name: "other-repo" })];

    const { result } = renderHook(() => useRepositoryContext(), {
      wrapper: createWrapper(repos),
    });

    expect(result.current.repositories).toHaveLength(2);
    expect(result.current.repositories[0].id).toBe("repo-1");
    expect(result.current.repositories[1].id).toBe("repo-2");
  });

  it("provides isLoading state", () => {
    const { result } = renderHook(() => useRepositoryContext(), {
      wrapper: createWrapper([], true),
    });

    expect(result.current.isLoading).toBe(true);
  });

  it("defaults to 'all' when multiple repos and no stored value", () => {
    const repos = [makeRepo({ id: "repo-1" }), makeRepo({ id: "repo-2" })];

    const { result } = renderHook(() => useRepositoryContext(), {
      wrapper: createWrapper(repos),
    });

    expect(result.current.selectedRepoId).toBe("all");
    expect(result.current.selectedRepository).toBeNull();
  });

  it("auto-selects the single repo when only one exists", () => {
    const repos = [makeRepo({ id: "repo-1" })];

    const { result } = renderHook(() => useRepositoryContext(), {
      wrapper: createWrapper(repos),
    });

    expect(result.current.selectedRepoId).toBe("repo-1");
    expect(result.current.selectedRepository?.id).toBe("repo-1");
  });

  it("persists single repo auto-select to localStorage", () => {
    const repos = [makeRepo({ id: "repo-1" })];

    renderHook(() => useRepositoryContext(), {
      wrapper: createWrapper(repos),
    });

    expect(window.localStorage.setItem).toHaveBeenCalledWith("gogo-selected-repo", "repo-1");
  });

  it("restores stored value from localStorage", () => {
    mockLocalStorage["gogo-selected-repo"] = "repo-2";
    const repos = [makeRepo({ id: "repo-1" }), makeRepo({ id: "repo-2", name: "other" })];

    const { result } = renderHook(() => useRepositoryContext(), {
      wrapper: createWrapper(repos),
    });

    expect(result.current.selectedRepoId).toBe("repo-2");
    expect(result.current.selectedRepository?.id).toBe("repo-2");
  });

  it("restores 'all' from localStorage", () => {
    mockLocalStorage["gogo-selected-repo"] = "all";
    const repos = [makeRepo({ id: "repo-1" }), makeRepo({ id: "repo-2" })];

    const { result } = renderHook(() => useRepositoryContext(), {
      wrapper: createWrapper(repos),
    });

    expect(result.current.selectedRepoId).toBe("all");
    expect(result.current.selectedRepository).toBeNull();
  });

  it("falls back to 'all' when stored repo ID no longer exists", () => {
    mockLocalStorage["gogo-selected-repo"] = "deleted-repo";
    const repos = [makeRepo({ id: "repo-1" }), makeRepo({ id: "repo-2" })];

    const { result } = renderHook(() => useRepositoryContext(), {
      wrapper: createWrapper(repos),
    });

    expect(result.current.selectedRepoId).toBe("all");
  });

  it("updates selectedRepoId and persists to localStorage via setSelectedRepoId", async () => {
    const repos = [makeRepo({ id: "repo-1" }), makeRepo({ id: "repo-2" })];

    const { result } = renderHook(() => useRepositoryContext(), {
      wrapper: createWrapper(repos),
    });

    act(() => {
      result.current.setSelectedRepoId("repo-2");
    });

    expect(result.current.selectedRepoId).toBe("repo-2");
    expect(window.localStorage.setItem).toHaveBeenCalledWith("gogo-selected-repo", "repo-2");
  });

  it("returns null selectedRepository when selectedRepoId is 'all'", () => {
    const repos = [makeRepo({ id: "repo-1" }), makeRepo({ id: "repo-2" })];

    const { result } = renderHook(() => useRepositoryContext(), {
      wrapper: createWrapper(repos),
    });

    expect(result.current.selectedRepoId).toBe("all");
    expect(result.current.selectedRepository).toBeNull();
  });

  it("returns the correct repository object for a selected repo", () => {
    mockLocalStorage["gogo-selected-repo"] = "repo-2";
    const repos = [makeRepo({ id: "repo-1", name: "first" }), makeRepo({ id: "repo-2", name: "second" })];

    const { result } = renderHook(() => useRepositoryContext(), {
      wrapper: createWrapper(repos),
    });

    expect(result.current.selectedRepository?.name).toBe("second");
  });
});
