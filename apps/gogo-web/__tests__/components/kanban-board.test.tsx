import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { KanbanBoard } from "@/components/dashboard/kanban-board";
import type { Job } from "@/types/job";

// Mock the child components and hooks
vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

vi.mock("@/hooks/use-jobs", () => ({
  useJobAction: () => ({ mutate: vi.fn(), isPending: false }),
  useJobLogs: () => ({ data: [] }),
}));

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("@/components/repo/repo-badge", () => ({
  RepoBadge: () => <span data-testid="repo-badge" />,
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
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
    phase: null,
    progress: null,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    ...overrides,
  };
}

describe("KanbanBoard", () => {
  it("shows empty state when no jobs", () => {
    render(<KanbanBoard jobs={[]} onJobClick={vi.fn()} />, {
      wrapper: createWrapper(),
    });

    // Each column shows "No jobs" when empty
    const emptyMessages = screen.getAllByText("No jobs");
    expect(emptyMessages.length).toBeGreaterThan(0);
  });

  it("renders column headers for active filter (default)", () => {
    const jobs = [makeJob({ id: "1", status: "queued" })];
    render(<KanbanBoard jobs={jobs} onJobClick={vi.fn()} />, {
      wrapper: createWrapper(),
    });

    // Default "active" filter shows queued, running, and PR columns (not attention or completed)
    const headers = screen.getAllByRole("heading", { level: 2 });
    const headerTexts = headers.map((h) => h.textContent);
    expect(headerTexts).toContain("Queued");
    expect(headerTexts).toContain("Running");
    expect(headerTexts).toContain("Pull Request");
    expect(headerTexts).not.toContain("Needs Attention");
    expect(headerTexts).not.toContain("Completed");
  });

  it("groups jobs into correct columns with active filter", () => {
    const jobs = [
      makeJob({
        id: "1",
        issueNumber: 1,
        issueTitle: "Queued Job",
        status: "queued",
      }),
      makeJob({
        id: "2",
        issueNumber: 2,
        issueTitle: "Running Job",
        status: "running",
      }),
      makeJob({
        id: "3",
        issueNumber: 3,
        issueTitle: "PR Job",
        status: "pr_opened",
      }),
      makeJob({
        id: "4",
        issueNumber: 4,
        issueTitle: "Done Job",
        status: "done",
      }),
    ];
    render(<KanbanBoard jobs={jobs} onJobClick={vi.fn()} />, {
      wrapper: createWrapper(),
    });

    // Active filter shows non-done jobs
    expect(screen.getByText("Queued Job")).toBeInTheDocument();
    expect(screen.getByText("Running Job")).toBeInTheDocument();
    expect(screen.getByText("PR Job")).toBeInTheDocument();
    // Done jobs are excluded from the active filter
    expect(screen.queryByText("Done Job")).not.toBeInTheDocument();
  });

  it("shows completed jobs with completed filter", () => {
    const jobs = [
      makeJob({
        id: "1",
        issueNumber: 1,
        issueTitle: "Done Job",
        status: "done",
      }),
    ];
    render(<KanbanBoard jobs={jobs} onJobClick={vi.fn()} filter="completed" />, { wrapper: createWrapper() });

    expect(screen.getByText("Done Job")).toBeInTheDocument();
  });
});
