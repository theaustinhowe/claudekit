import { cast } from "@claudekit/test-utils";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@claudekit/ui/components/badge", () => ({
  Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

vi.mock("@claudekit/ui/components/button", () => ({
  Button: ({ children, ...props }: { children: ReactNode }) => <button {...props}>{children}</button>,
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

vi.mock("@claudekit/ui/components/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TooltipContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TooltipProvider: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/issues/issue-content", () => ({
  IssueAuthorInfo: ({ user }: { user: { login: string } }) => <div data-testid="author">{user.login}</div>,
  IssueDescription: ({ body }: { body: string }) => <div data-testid="description">{body}</div>,
  IssueComments: () => <div data-testid="comments" />,
}));

import { IssueDetailDrawer } from "@/components/issues/issue-detail-drawer";

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

const makeIssue = (overrides = {}) => ({
  id: "issue-1",
  number: 42,
  title: "Fix the login bug",
  body: "The login page crashes on mobile",
  state: "open",
  htmlUrl: "https://github.com/org/repo/issues/42",
  user: { login: "user1", avatarUrl: "https://avatar.com/u1", htmlUrl: "https://github.com/user1" },
  labels: [{ name: "bug", color: "d73a4a" }],
  hasJob: false,
  jobId: null,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
  ...overrides,
});

describe("IssueDetailDrawer", () => {
  afterEach(() => cleanup());

  it("returns null when issue is null", () => {
    const { container } = render(
      <IssueDetailDrawer issue={null} repositoryId="repo-1" open={true} onOpenChange={vi.fn()} onCreateJob={vi.fn()} />,
      { wrapper: createWrapper() },
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders issue title and number", () => {
    render(
      <IssueDetailDrawer
        issue={cast(makeIssue())}
        repositoryId="repo-1"
        open={true}
        onOpenChange={vi.fn()}
        onCreateJob={vi.fn()}
      />,
      { wrapper: createWrapper() },
    );
    expect(screen.getByText("Fix the login bug")).toBeInTheDocument();
    expect(screen.getByText("#42")).toBeInTheDocument();
  });

  it("shows open state badge", () => {
    render(
      <IssueDetailDrawer
        issue={cast(makeIssue())}
        repositoryId="repo-1"
        open={true}
        onOpenChange={vi.fn()}
        onCreateJob={vi.fn()}
      />,
      { wrapper: createWrapper() },
    );
    expect(screen.getByText("open")).toBeInTheDocument();
  });

  it("shows author info", () => {
    render(
      <IssueDetailDrawer
        issue={cast(makeIssue())}
        repositoryId="repo-1"
        open={true}
        onOpenChange={vi.fn()}
        onCreateJob={vi.fn()}
      />,
      { wrapper: createWrapper() },
    );
    expect(screen.getByTestId("author")).toBeInTheDocument();
  });

  it("shows issue description", () => {
    render(
      <IssueDetailDrawer
        issue={cast(makeIssue())}
        repositoryId="repo-1"
        open={true}
        onOpenChange={vi.fn()}
        onCreateJob={vi.fn()}
      />,
      { wrapper: createWrapper() },
    );
    expect(screen.getByTestId("description")).toBeInTheDocument();
  });

  it("shows labels", () => {
    render(
      <IssueDetailDrawer
        issue={cast(makeIssue())}
        repositoryId="repo-1"
        open={true}
        onOpenChange={vi.fn()}
        onCreateJob={vi.fn()}
      />,
      { wrapper: createWrapper() },
    );
    expect(screen.getByText("bug")).toBeInTheDocument();
  });

  it("shows create job button when no job exists", () => {
    render(
      <IssueDetailDrawer
        issue={cast(makeIssue())}
        repositoryId="repo-1"
        open={true}
        onOpenChange={vi.fn()}
        onCreateJob={vi.fn()}
      />,
      { wrapper: createWrapper() },
    );
    expect(screen.getByText("Create Job")).toBeInTheDocument();
  });

  it("shows view job link when job exists", () => {
    render(
      <IssueDetailDrawer
        issue={cast(makeIssue({ hasJob: true, jobId: "job-1" }))}
        repositoryId="repo-1"
        open={true}
        onOpenChange={vi.fn()}
        onCreateJob={vi.fn()}
      />,
      { wrapper: createWrapper() },
    );
    expect(screen.getByText("View Job")).toBeInTheDocument();
  });

  it("renders nothing when closed", () => {
    render(
      <IssueDetailDrawer
        issue={cast(makeIssue())}
        repositoryId="repo-1"
        open={false}
        onOpenChange={vi.fn()}
        onCreateJob={vi.fn()}
      />,
      { wrapper: createWrapper() },
    );
    expect(screen.queryByText("Fix the login bug")).not.toBeInTheDocument();
  });
});
