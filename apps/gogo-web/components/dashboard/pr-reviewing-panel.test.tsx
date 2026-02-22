import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@claudekit/ui/components/button", () => ({
  Button: ({ children, ...props }: { children: ReactNode }) => <button {...props}>{children}</button>,
}));

vi.mock("@claudekit/ui/components/card", () => ({
  Card: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: ReactNode }) => <h3>{children}</h3>,
}));

import { PrReviewingPanel } from "@/components/dashboard/pr-reviewing-panel";

const makeJob = (overrides = {}) => ({
  id: "job-1",
  status: "pr_reviewing",
  prUrl: "https://github.com/org/repo/pull/10",
  prNumber: 10,
  ...overrides,
});

describe("PrReviewingPanel", () => {
  afterEach(() => cleanup());

  it("renders monitoring card", () => {
    render(<PrReviewingPanel job={makeJob() as never} />);
    expect(screen.getByText(/monitoring for reviews/i)).toBeInTheDocument();
  });

  it("shows PR number", () => {
    render(<PrReviewingPanel job={makeJob() as never} />);
    expect(screen.getByText(/#10/)).toBeInTheDocument();
  });

  it("shows checking interval text", () => {
    render(<PrReviewingPanel job={makeJob() as never} />);
    expect(screen.getByText(/every 30 seconds/i)).toBeInTheDocument();
  });

  it("shows GitHub link when prUrl exists", () => {
    render(<PrReviewingPanel job={makeJob() as never} />);
    expect(screen.getByText(/view on github/i)).toBeInTheDocument();
  });

  it("hides GitHub link when no prUrl", () => {
    render(<PrReviewingPanel job={makeJob({ prUrl: null }) as never} />);
    expect(screen.queryByText(/view on github/i)).not.toBeInTheDocument();
  });
});
