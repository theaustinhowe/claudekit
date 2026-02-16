import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JobCard } from "@/components/dashboard/job-card";
import type { Job } from "@/types/job";

// Mock the hooks that JobCard uses internally
vi.mock("@/hooks/use-jobs", () => ({
  useJobAction: () => ({ mutate: vi.fn(), isPending: false }),
  useJobLogs: () => ({ data: [] }),
}));

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
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
    issueNumber: 42,
    issueUrl: "https://github.com/test/repo/issues/42",
    issueTitle: "Fix authentication bug",
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
    phase: null,
    progress: null,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    ...overrides,
  };
}

describe("JobCard", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders job title and issue number", () => {
    const job = makeJob();
    render(<JobCard job={job} onClick={vi.fn()} />, {
      wrapper: createWrapper(),
    });

    expect(screen.getByText("Fix authentication bug")).toBeInTheDocument();
    expect(screen.getByText("#42")).toBeInTheDocument();
  });

  it("renders status badge for queued job", () => {
    const job = makeJob({ status: "queued" });
    render(<JobCard job={job} onClick={vi.fn()} />, {
      wrapper: createWrapper(),
    });

    const matches = screen.getAllByText("Queued");
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("renders status badge for running job", () => {
    const job = makeJob({ status: "running" });
    render(<JobCard job={job} onClick={vi.fn()} />, {
      wrapper: createWrapper(),
    });

    const matches = screen.getAllByText("Running");
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("renders failure reason for failed jobs", () => {
    const job = makeJob({
      status: "failed",
      failureReason: "Tests failed",
    });
    render(<JobCard job={job} onClick={vi.fn()} />, {
      wrapper: createWrapper(),
    });

    expect(screen.getByText("Tests failed")).toBeInTheDocument();
  });

  it("renders needs info question for needs_info jobs", () => {
    const job = makeJob({
      status: "needs_info",
      needsInfoQuestion: "What database should I use?",
    });
    render(<JobCard job={job} onClick={vi.fn()} />, {
      wrapper: createWrapper(),
    });

    expect(screen.getByText("What database should I use?")).toBeInTheDocument();
  });

  it("calls onClick when clicked", async () => {
    const onClick = vi.fn();
    const job = makeJob();
    render(<JobCard job={job} onClick={onClick} />, {
      wrapper: createWrapper(),
    });

    const card = screen.getByRole("button", {
      name: /Job #42: Fix authentication bug/,
    });
    card.click();
    expect(onClick).toHaveBeenCalledWith(job);
  });
});
