import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@claudekit/ui/components/badge", () => ({
  Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

vi.mock("@claudekit/ui/components/button", () => ({
  Button: ({ children, ...props }: { children: ReactNode }) => <button {...props}>{children}</button>,
}));

vi.mock("@claudekit/ui/components/card", () => ({
  Card: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

import { ArchivedJobCard } from "@/components/archive/archived-job-card";

const makeJob = (overrides = {}) => ({
  id: "job-1",
  issueNumber: 42,
  issueTitle: "Fix login bug",
  status: "done",
  branch: "fix/login-42",
  issueUrl: "https://github.com/org/repo/issues/42",
  updatedAt: "2024-01-01T00:00:00Z",
  ...overrides,
});

describe("ArchivedJobCard", () => {
  afterEach(() => cleanup());

  it("renders issue number and title", () => {
    render(<ArchivedJobCard job={makeJob() as never} />);
    expect(screen.getByText("#42")).toBeInTheDocument();
    expect(screen.getByText("Fix login bug")).toBeInTheDocument();
  });

  it("shows branch name", () => {
    render(<ArchivedJobCard job={makeJob() as never} />);
    expect(screen.getByText("fix/login-42")).toBeInTheDocument();
  });

  it("shows restore button", () => {
    render(<ArchivedJobCard job={makeJob() as never} />);
    expect(screen.getByText("Restore")).toBeInTheDocument();
  });

  it("hides branch when not present", () => {
    render(<ArchivedJobCard job={makeJob({ branch: null }) as never} />);
    expect(screen.queryByText("fix/login-42")).not.toBeInTheDocument();
  });
});
