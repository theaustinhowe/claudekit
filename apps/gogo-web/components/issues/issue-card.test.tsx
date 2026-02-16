import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@devkit/ui/components/badge", () => ({
  Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

vi.mock("@devkit/ui/components/button", () => ({
  Button: ({ children, ...props }: { children: ReactNode }) => <button {...props}>{children}</button>,
}));

vi.mock("@devkit/ui/components/card", () => ({
  Card: ({ children, ...props }: { children: ReactNode }) => <div {...props}>{children}</div>,
  CardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@devkit/ui/components/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TooltipContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TooltipProvider: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("next/image", () => ({
  // biome-ignore lint/performance/noImgElement: test mock
  default: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

import { IssueCard } from "@/components/issues/issue-card";

const makeIssue = (overrides = {}) => ({
  number: 42,
  title: "Fix the login bug",
  state: "open",
  html_url: "https://github.com/org/repo/issues/42",
  user: { login: "testuser", avatar_url: "https://avatar.com/u1" },
  labels: [{ id: 1, name: "bug", color: "d73a4a" }],
  hasJob: false,
  jobId: null,
  created_at: "2024-01-01T00:00:00Z",
  ...overrides,
});

describe("IssueCard", () => {
  afterEach(() => cleanup());

  it("renders issue number and title", () => {
    render(<IssueCard issue={makeIssue() as never} onCreateJob={vi.fn()} />);
    expect(screen.getByText("#42")).toBeInTheDocument();
    expect(screen.getByText("Fix the login bug")).toBeInTheDocument();
  });

  it("shows open state badge", () => {
    render(<IssueCard issue={makeIssue() as never} onCreateJob={vi.fn()} />);
    expect(screen.getByText("open")).toBeInTheDocument();
  });

  it("shows labels", () => {
    render(<IssueCard issue={makeIssue() as never} onCreateJob={vi.fn()} />);
    expect(screen.getByText("bug")).toBeInTheDocument();
  });

  it("shows create job button when no job exists", () => {
    render(<IssueCard issue={makeIssue() as never} onCreateJob={vi.fn()} />);
    expect(screen.getByText("Create Job")).toBeInTheDocument();
  });

  it("shows view job link when job exists", () => {
    render(<IssueCard issue={makeIssue({ hasJob: true, jobId: "job-1" }) as never} onCreateJob={vi.fn()} />);
    expect(screen.getByText("View Job")).toBeInTheDocument();
  });

  it("shows author avatar", () => {
    render(<IssueCard issue={makeIssue() as never} onCreateJob={vi.fn()} />);
    expect(screen.getByAltText("testuser")).toBeInTheDocument();
  });
});
