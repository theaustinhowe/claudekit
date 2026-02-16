import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@devkit/ui/components/skeleton", () => ({
  Skeleton: ({ className }: { className?: string }) => <div data-testid="skeleton" className={className} />,
}));

vi.mock("lucide-react", () => ({
  Inbox: () => <span data-testid="inbox-icon" />,
}));

vi.mock("./issue-card", () => ({
  IssueCard: ({ issue }: { issue: { number: number; title: string } }) => (
    <div data-testid={`issue-${issue.number}`}>{issue.title}</div>
  ),
}));

import { IssueList } from "@/components/issues/issue-list";
import type { GitHubIssue } from "@/lib/api";

function makeIssue(number: number, title: string): GitHubIssue {
  return {
    number,
    title,
    body: null,
    html_url: `https://github.com/test/repo/issues/${number}`,
    state: "open",
    labels: [],
    created_at: "2024-01-01T00:00:00Z",
    user: null,
    hasJob: false,
    jobId: null,
  };
}

describe("IssueList", () => {
  afterEach(() => cleanup());

  it("shows loading skeletons when loading", () => {
    render(<IssueList issues={[]} isLoading onCreateJob={() => {}} />);
    expect(screen.getAllByTestId("skeleton")).toHaveLength(6);
  });

  it("shows empty state when no issues", () => {
    render(<IssueList issues={[]} onCreateJob={() => {}} />);
    expect(screen.getByText("No issues found")).toBeInTheDocument();
    expect(screen.getByTestId("inbox-icon")).toBeInTheDocument();
  });

  it("renders issue cards", () => {
    const issues = [makeIssue(1, "Bug fix"), makeIssue(2, "Feature request")];
    render(<IssueList issues={issues} onCreateJob={() => {}} />);
    expect(screen.getByText("Bug fix")).toBeInTheDocument();
    expect(screen.getByText("Feature request")).toBeInTheDocument();
  });

  it("renders correct number of issue cards", () => {
    const issues = [makeIssue(1, "Issue 1"), makeIssue(2, "Issue 2"), makeIssue(3, "Issue 3")];
    render(<IssueList issues={issues} onCreateJob={() => {}} />);
    expect(screen.getByTestId("issue-1")).toBeInTheDocument();
    expect(screen.getByTestId("issue-2")).toBeInTheDocument();
    expect(screen.getByTestId("issue-3")).toBeInTheDocument();
  });
});
