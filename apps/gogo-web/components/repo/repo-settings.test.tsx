import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RepositoryInfo } from "@/lib/api";
import { RepoSettings } from "./repo-settings";

// Mock hooks
const mockUpdateSettings = vi.fn();
vi.mock("@/hooks/use-repositories", () => ({
  useRepositorySettings: () => ({
    data: {
      pollIntervalMs: 30000,
      testCommand: "npm test",
      agentProvider: "claude-code",
      triggerLabel: "agent",
      branchPattern: "agent/issue-{number}-{slug}",
      baseBranch: "main",
      autoCleanup: true,
      autoStartJobs: true,
      autoCreatePr: true,
    },
    isLoading: false,
  }),
  useRepositoryBranches: () => ({
    data: {
      branches: [
        { name: "main", isDefault: true, protected: true },
        { name: "develop", isDefault: false, protected: false },
      ],
    },
    isLoading: false,
  }),
  useUpdateRepositorySettings: () => ({
    mutate: mockUpdateSettings,
    isPending: false,
  }),
}));

vi.mock("@/hooks/use-agents", () => ({
  useAgents: () => ({
    data: [
      {
        type: "claude-code",
        displayName: "Claude Code",
        capabilities: { canResume: true, canInject: true, supportsStreaming: true },
      },
      {
        type: "mock",
        displayName: "Mock Agent",
        capabilities: { canResume: false, canInject: false, supportsStreaming: false },
      },
    ],
    isLoading: false,
  }),
  useAgentStatus: () => ({
    data: {
      available: true,
      configured: true,
      featureFlagEnabled: true,
      apiKeySet: true,
      message: "",
    },
  }),
}));

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function makeRepo(overrides: Partial<RepositoryInfo> = {}): RepositoryInfo {
  return {
    id: "repo-1",
    owner: "acme",
    name: "my-project",
    displayName: null,
    githubToken: "***",
    baseBranch: "main",
    triggerLabel: "agent",
    workdirPath: "/home/user/projects/my-project",
    isActive: true,
    autoCreateJobs: true,
    removeLabelAfterCreate: true,
    pollIntervalMs: 30000,
    testCommand: "npm test",
    agentProvider: "claude-code",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("RepoSettings", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the repository display name", () => {
    render(<RepoSettings repository={makeRepo({ displayName: "My Cool Project" })} />, {
      wrapper: createWrapper(),
    });

    expect(screen.getByText("My Cool Project")).toBeInTheDocument();
  });

  it("falls back to owner/name when displayName is null", () => {
    render(<RepoSettings repository={makeRepo()} />, {
      wrapper: createWrapper(),
    });

    expect(screen.getByText("acme/my-project")).toBeInTheDocument();
  });

  it("shows Active status for active repos", () => {
    render(<RepoSettings repository={makeRepo({ isActive: true })} />, {
      wrapper: createWrapper(),
    });

    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("shows Inactive status for inactive repos", () => {
    render(<RepoSettings repository={makeRepo({ isActive: false })} />, {
      wrapper: createWrapper(),
    });

    expect(screen.getByText("Inactive")).toBeInTheDocument();
  });

  it("renders the owner/name as description beneath the title", () => {
    render(<RepoSettings repository={makeRepo({ displayName: "My Cool Project" })} />, {
      wrapper: createWrapper(),
    });

    // Title shows displayName, description shows owner/name
    expect(screen.getByText("My Cool Project")).toBeInTheDocument();
    expect(screen.getByText("acme/my-project")).toBeInTheDocument();
  });

  it("renders as a collapsible card (initially collapsed)", () => {
    render(<RepoSettings repository={makeRepo()} />, {
      wrapper: createWrapper(),
    });

    // The "Save Settings" button is inside the collapsed content, so it should not be visible initially
    expect(screen.queryByText("Save Settings")).not.toBeInTheDocument();
  });

  it("expands when the header is clicked and shows settings", () => {
    render(<RepoSettings repository={makeRepo()} />, {
      wrapper: createWrapper(),
    });

    // Click the header to expand
    const header = screen.getByText("acme/my-project").closest("button");
    if (header) {
      header.click();
    }

    expect(screen.getByText("Save Settings")).toBeInTheDocument();
    expect(screen.getByText("Trigger Label")).toBeInTheDocument();
    expect(screen.getByText("Base Branch")).toBeInTheDocument();
    expect(screen.getByText("Branch Pattern")).toBeInTheDocument();
    expect(screen.getByText("Poll Interval")).toBeInTheDocument();
    expect(screen.getByText("Test Command")).toBeInTheDocument();
    expect(screen.getByText("Default Agent")).toBeInTheDocument();
  });

  it("shows automation toggles when expanded", () => {
    render(<RepoSettings repository={makeRepo()} />, {
      wrapper: createWrapper(),
    });

    const header = screen.getByText("acme/my-project").closest("button");
    if (header) {
      header.click();
    }

    expect(screen.getByText("Auto Start Jobs")).toBeInTheDocument();
    expect(screen.getByText("Auto Create PR")).toBeInTheDocument();
    expect(screen.getByText("Auto Cleanup")).toBeInTheDocument();
  });
});
