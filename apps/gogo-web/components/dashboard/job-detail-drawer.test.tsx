import { cast } from "@claudekit/test-utils";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockPerformAction = vi.fn();
const mockTriggerCreatePr = vi.fn();
const mockCheckResponse = vi.fn();

vi.mock("@/hooks/use-jobs", () => ({
  useJob: vi.fn(),
  useJobEvents: vi.fn(() => ({ data: [], isFetching: false, refetch: vi.fn() })),
  useJobAction: () => ({ mutate: mockPerformAction, isPending: false }),
  useCreatePr: () => ({ mutate: mockTriggerCreatePr, isPending: false }),
  useCheckNeedsInfoResponse: () => ({ mutate: mockCheckResponse, isPending: false }),
  useJobLogs: vi.fn(() => ({ data: [], isLoading: false })),
}));

vi.mock("@/types/job", () => ({
  JOB_STATUS_CONFIG: {
    queued: { label: "Queued", color: "text-gray-500", bgColor: "bg-gray-100" },
    planning: { label: "Planning", color: "text-indigo-500", bgColor: "bg-indigo-100" },
    awaiting_plan_approval: { label: "Awaiting Approval", color: "text-yellow-500", bgColor: "bg-yellow-100" },
    running: { label: "Running", color: "text-blue-500", bgColor: "bg-blue-100" },
    needs_info: { label: "Needs Info", color: "text-orange-500", bgColor: "bg-orange-100" },
    paused: { label: "Paused", color: "text-gray-500", bgColor: "bg-gray-100" },
    ready_to_pr: { label: "Ready to PR", color: "text-green-500", bgColor: "bg-green-100" },
    pr_opened: { label: "PR Opened", color: "text-purple-500", bgColor: "bg-purple-100" },
    pr_reviewing: { label: "PR Reviewing", color: "text-purple-500", bgColor: "bg-purple-100" },
    failed: { label: "Failed", color: "text-red-500", bgColor: "bg-red-100" },
    done: { label: "Done", color: "text-green-500", bgColor: "bg-green-100" },
  },
}));

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock all @claudekit/ui components
vi.mock("@claudekit/ui/components/alert-dialog", () => ({
  AlertDialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogAction: ({ children, ...props }: { children: ReactNode }) => <button {...props}>{children}</button>,
  AlertDialogCancel: ({ children }: { children: ReactNode }) => <button type="button">{children}</button>,
  AlertDialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: ReactNode }) => <h3>{children}</h3>,
  AlertDialogTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@claudekit/ui/components/badge", () => ({
  Badge: ({ children }: { children: ReactNode }) => <span data-testid="badge">{children}</span>,
}));

vi.mock("@claudekit/ui/components/button", () => ({
  Button: ({ children, ...props }: { children: ReactNode } & Record<string, unknown>) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock("@claudekit/ui/components/scroll-area", () => ({
  ScrollArea: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@claudekit/ui/components/sheet", () => ({
  Sheet: ({ children, open }: { children: ReactNode; open: boolean }) =>
    open ? <div data-testid="sheet">{children}</div> : null,
  SheetContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  SheetBody: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@claudekit/ui/components/skeleton", () => ({
  Skeleton: ({ className }: { className: string }) => <div data-testid="skeleton" className={className} />,
}));

vi.mock("@claudekit/ui/components/tabs", () => ({
  Tabs: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TabsContent: ({ children, value }: { children: ReactNode; value: string }) => (
    <div data-testid={`tab-content-${value}`}>{children}</div>
  ),
  TabsList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({ children, value }: { children: ReactNode; value: string }) => (
    <button type="button" data-testid={`tab-trigger-${value}`}>
      {children}
    </button>
  ),
}));

vi.mock("@claudekit/ui/components/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TooltipContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TooltipProvider: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

// Mock child components to reduce noise
vi.mock("@/components/dashboard/activity-summary", () => ({
  ActivitySummary: () => <div data-testid="activity-summary" />,
}));

vi.mock("@/components/dashboard/failed-job-panel", () => ({
  FailedJobPanel: () => <div data-testid="failed-job-panel" />,
}));

vi.mock("@/components/dashboard/inject-modal", () => ({
  InjectModal: ({ variant }: { variant?: string }) => (
    <button type="button" data-testid="inject-modal">
      {variant === "prominent" ? "Guide Agent" : "Inject"}
    </button>
  ),
}));

vi.mock("@/components/dashboard/job-timeline", () => ({
  JobTimeline: () => <div data-testid="job-timeline" />,
}));

vi.mock("@/components/dashboard/log-preview", () => ({
  LogPreview: () => <div data-testid="log-preview" />,
}));

vi.mock("@/components/dashboard/log-viewer", () => ({
  LogViewer: () => <div data-testid="log-viewer" />,
}));

vi.mock("@/components/dashboard/needs-info-panel", () => ({
  NeedsInfoPanel: () => <div data-testid="needs-info-panel" />,
}));

vi.mock("@/components/dashboard/paused-job-panel", () => ({
  PausedJobPanel: () => <div data-testid="paused-job-panel" />,
}));

vi.mock("@/components/dashboard/plan-approval-panel", () => ({
  PlanApprovalPanel: () => <div data-testid="plan-approval-panel" />,
}));

vi.mock("@/components/dashboard/pr-opened-panel", () => ({
  PrOpenedPanel: () => <div data-testid="pr-opened-panel" />,
}));

vi.mock("@/components/dashboard/pr-reviewing-panel", () => ({
  PrReviewingPanel: () => <div data-testid="pr-reviewing-panel" />,
}));

vi.mock("@/components/dashboard/ready-to-pr-panel", () => ({
  ReadyToPrPanel: () => <div data-testid="ready-to-pr-panel" />,
}));

vi.mock("@/components/issues/issue-content", () => ({
  IssueDescription: ({ body }: { body: string }) => <div data-testid="issue-description">{body}</div>,
  IssueComments: () => <div data-testid="issue-comments" />,
}));

import { JobDetailDrawer } from "@/components/dashboard/job-detail-drawer";
import { useJob } from "@/hooks/use-jobs";

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

const makeJob = (overrides = {}) => ({
  id: "job-1",
  issueNumber: 42,
  issueTitle: "Fix the login bug",
  issueBody: "Login page crashes on mobile",
  issueUrl: "https://github.com/org/repo/issues/42",
  status: "running",
  branch: "fix/login-bug-42",
  prUrl: null,
  failureReason: null,
  changeSummary: null,
  testRetryCount: 0,
  needsInfoQuestion: null,
  pauseReason: null,
  agentType: "claude-code",
  worktreePath: "/tmp/worktrees/fix-login",
  planContent: null,
  source: "github",
  repositoryId: "repo-1",
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T01:00:00Z",
  ...overrides,
});

describe("JobDetailDrawer", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when no jobId", () => {
    vi.mocked(useJob).mockReturnValue(cast({ data: null, isLoading: false }));

    const { container } = render(<JobDetailDrawer jobId={null} open={true} onOpenChange={vi.fn()} />, {
      wrapper: createWrapper(),
    });

    expect(container.innerHTML).toBe("");
  });

  it("shows loading skeleton when loading", () => {
    vi.mocked(useJob).mockReturnValue(cast({ data: undefined, isLoading: true }));

    render(<JobDetailDrawer jobId="job-1" open={true} onOpenChange={vi.fn()} />, { wrapper: createWrapper() });

    expect(screen.getAllByTestId("skeleton").length).toBeGreaterThanOrEqual(1);
  });

  it("shows 'Job not found' when job is undefined", () => {
    vi.mocked(useJob).mockReturnValue(cast({ data: undefined, isLoading: false }));

    render(<JobDetailDrawer jobId="job-1" open={true} onOpenChange={vi.fn()} />, { wrapper: createWrapper() });

    expect(screen.getByText("Job not found")).toBeInTheDocument();
  });

  it("renders job title and status for running job", () => {
    vi.mocked(useJob).mockReturnValue(
      cast({
        data: makeJob(),
        isLoading: false,
      }),
    );

    render(<JobDetailDrawer jobId="job-1" open={true} onOpenChange={vi.fn()} />, { wrapper: createWrapper() });

    expect(screen.getByText("Fix the login bug")).toBeInTheDocument();
    expect(screen.getByText("#42")).toBeInTheDocument();
    expect(screen.getByText("Running")).toBeInTheDocument();
  });

  it("shows branch name and copy button", () => {
    vi.mocked(useJob).mockReturnValue(
      cast({
        data: makeJob(),
        isLoading: false,
      }),
    );

    render(<JobDetailDrawer jobId="job-1" open={true} onOpenChange={vi.fn()} />, { wrapper: createWrapper() });

    expect(screen.getByText("fix/login-bug-42")).toBeInTheDocument();
  });

  it("shows PR link when available", () => {
    vi.mocked(useJob).mockReturnValue(
      cast({
        data: makeJob({ prUrl: "https://github.com/org/repo/pull/10" }),
        isLoading: false,
      }),
    );

    render(<JobDetailDrawer jobId="job-1" open={true} onOpenChange={vi.fn()} />, { wrapper: createWrapper() });

    expect(screen.getByText("View Pull Request")).toBeInTheDocument();
  });

  it("shows failure reason for failed jobs", () => {
    vi.mocked(useJob).mockReturnValue(
      cast({
        data: makeJob({ status: "failed", failureReason: "Test suite failed with 3 errors" }),
        isLoading: false,
      }),
    );

    render(<JobDetailDrawer jobId="job-1" open={true} onOpenChange={vi.fn()} />, { wrapper: createWrapper() });

    expect(screen.getByText("Test suite failed with 3 errors")).toBeInTheDocument();
    expect(screen.getByTestId("failed-job-panel")).toBeInTheDocument();
  });

  it("shows pause/resume and abort buttons for running jobs", () => {
    vi.mocked(useJob).mockReturnValue(
      cast({
        data: makeJob({ status: "running" }),
        isLoading: false,
      }),
    );

    render(<JobDetailDrawer jobId="job-1" open={true} onOpenChange={vi.fn()} />, { wrapper: createWrapper() });

    expect(screen.getByText("Pause")).toBeInTheDocument();
    // "Abort Job" and "Stop & Pause" appear twice each (trigger + dialog action)
    expect(screen.getAllByText("Abort Job").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Stop & Pause").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Guide Agent")).toBeInTheDocument();
  });

  it("shows retry button for failed jobs", () => {
    vi.mocked(useJob).mockReturnValue(
      cast({
        data: makeJob({ status: "failed" }),
        isLoading: false,
      }),
    );

    render(<JobDetailDrawer jobId="job-1" open={true} onOpenChange={vi.fn()} />, { wrapper: createWrapper() });

    expect(screen.getByText("Retry")).toBeInTheDocument();
  });

  it("shows resume button for paused jobs", () => {
    vi.mocked(useJob).mockReturnValue(
      cast({
        data: makeJob({ status: "paused" }),
        isLoading: false,
      }),
    );

    render(<JobDetailDrawer jobId="job-1" open={true} onOpenChange={vi.fn()} />, { wrapper: createWrapper() });

    expect(screen.getByText("Resume")).toBeInTheDocument();
    expect(screen.getByText("Mark Failed")).toBeInTheDocument();
    expect(screen.getByTestId("paused-job-panel")).toBeInTheDocument();
  });

  it("renders tabs: Overview, Issue, Logs, History", () => {
    vi.mocked(useJob).mockReturnValue(
      cast({
        data: makeJob(),
        isLoading: false,
      }),
    );

    render(<JobDetailDrawer jobId="job-1" open={true} onOpenChange={vi.fn()} />, { wrapper: createWrapper() });

    expect(screen.getByTestId("tab-trigger-overview")).toBeInTheDocument();
    expect(screen.getByTestId("tab-trigger-issue")).toBeInTheDocument();
    expect(screen.getByTestId("tab-trigger-logs")).toBeInTheDocument();
    expect(screen.getByTestId("tab-trigger-history")).toBeInTheDocument();
  });

  it("shows Manual Job badge for manual jobs (negative issue number)", () => {
    vi.mocked(useJob).mockReturnValue(
      cast({
        data: makeJob({ issueNumber: -1 }),
        isLoading: false,
      }),
    );

    render(<JobDetailDrawer jobId="job-1" open={true} onOpenChange={vi.fn()} />, { wrapper: createWrapper() });

    expect(screen.getByText("Manual Job")).toBeInTheDocument();
  });

  it("shows agent type badge", () => {
    vi.mocked(useJob).mockReturnValue(
      cast({
        data: makeJob({ agentType: "mock" }),
        isLoading: false,
      }),
    );

    render(<JobDetailDrawer jobId="job-1" open={true} onOpenChange={vi.fn()} />, { wrapper: createWrapper() });

    expect(screen.getByText("Mock")).toBeInTheDocument();
  });

  it("shows VS Code button when worktreePath exists", () => {
    vi.mocked(useJob).mockReturnValue(
      cast({
        data: makeJob(),
        isLoading: false,
      }),
    );

    render(<JobDetailDrawer jobId="job-1" open={true} onOpenChange={vi.fn()} />, { wrapper: createWrapper() });

    expect(screen.getByText("VS Code")).toBeInTheDocument();
  });

  it("shows change summary when available", () => {
    vi.mocked(useJob).mockReturnValue(
      cast({
        data: makeJob({ changeSummary: "src/index.ts\nsrc/utils.ts" }),
        isLoading: false,
      }),
    );

    render(<JobDetailDrawer jobId="job-1" open={true} onOpenChange={vi.fn()} />, { wrapper: createWrapper() });

    expect(screen.getByText("Changes so far")).toBeInTheDocument();
    expect(screen.getByText("(2 files)")).toBeInTheDocument();
  });

  it("shows needs info panel when status is needs_info", () => {
    vi.mocked(useJob).mockReturnValue(
      cast({
        data: makeJob({ status: "needs_info", needsInfoQuestion: "What auth method should I use?" }),
        isLoading: false,
      }),
    );

    render(<JobDetailDrawer jobId="job-1" open={true} onOpenChange={vi.fn()} />, { wrapper: createWrapper() });

    expect(screen.getByTestId("needs-info-panel")).toBeInTheDocument();
  });

  it("shows plan approval panel when awaiting approval", () => {
    vi.mocked(useJob).mockReturnValue(
      cast({
        data: makeJob({ status: "awaiting_plan_approval", planContent: "## Plan\n- Step 1\n- Step 2" }),
        isLoading: false,
      }),
    );

    render(<JobDetailDrawer jobId="job-1" open={true} onOpenChange={vi.fn()} />, { wrapper: createWrapper() });

    expect(screen.getByTestId("plan-approval-panel")).toBeInTheDocument();
  });

  it("shows ready to PR panel", () => {
    vi.mocked(useJob).mockReturnValue(
      cast({
        data: makeJob({ status: "ready_to_pr" }),
        isLoading: false,
      }),
    );

    render(<JobDetailDrawer jobId="job-1" open={true} onOpenChange={vi.fn()} />, { wrapper: createWrapper() });

    expect(screen.getByTestId("ready-to-pr-panel")).toBeInTheDocument();
  });

  it("shows PR opened panel", () => {
    vi.mocked(useJob).mockReturnValue(
      cast({
        data: makeJob({ status: "pr_opened", prUrl: "https://github.com/org/repo/pull/10" }),
        isLoading: false,
      }),
    );

    render(<JobDetailDrawer jobId="job-1" open={true} onOpenChange={vi.fn()} />, { wrapper: createWrapper() });

    expect(screen.getByTestId("pr-opened-panel")).toBeInTheDocument();
  });

  it("shows PR reviewing panel", () => {
    vi.mocked(useJob).mockReturnValue(
      cast({
        data: makeJob({ status: "pr_reviewing" }),
        isLoading: false,
      }),
    );

    render(<JobDetailDrawer jobId="job-1" open={true} onOpenChange={vi.fn()} />, { wrapper: createWrapper() });

    expect(screen.getByTestId("pr-reviewing-panel")).toBeInTheDocument();
  });

  it("renders nothing when not open", () => {
    vi.mocked(useJob).mockReturnValue(
      cast({
        data: makeJob(),
        isLoading: false,
      }),
    );

    render(<JobDetailDrawer jobId="job-1" open={false} onOpenChange={vi.fn()} />, { wrapper: createWrapper() });

    expect(screen.queryByText("Fix the login bug")).not.toBeInTheDocument();
  });

  it("shows queue info when queued", () => {
    vi.mocked(useJob).mockReturnValue(
      cast({
        data: makeJob({ status: "queued" }),
        isLoading: false,
      }),
    );

    render(
      <JobDetailDrawer
        jobId="job-1"
        open={true}
        onOpenChange={vi.fn()}
        queuePosition={2}
        jobsAhead={[{ id: "j0", issueNumber: 10, issueTitle: "Earlier job" }]}
      />,
      { wrapper: createWrapper() },
    );

    expect(screen.getByText("#2 in queue")).toBeInTheDocument();
    expect(screen.getByText("Waiting in Queue")).toBeInTheDocument();
    expect(screen.getByText("Earlier job")).toBeInTheDocument();
  });
});
