import { cast } from "@claudekit/test-utils";
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

import { PrOpenedPanel } from "@/components/dashboard/pr-opened-panel";

const makeJob = (overrides = {}) => ({
  id: "job-1",
  status: "pr_opened",
  prUrl: "https://github.com/org/repo/pull/10",
  prNumber: 10,
  ...overrides,
});

describe("PrOpenedPanel", () => {
  afterEach(() => cleanup());

  it("renders PR opened card", () => {
    render(<PrOpenedPanel job={cast(makeJob())} />);
    expect(screen.getByText(/pull request/i)).toBeInTheDocument();
  });

  it("shows PR number", () => {
    render(<PrOpenedPanel job={cast(makeJob())} />);
    expect(screen.getByText(/#10/)).toBeInTheDocument();
  });

  it("shows review on GitHub link when prUrl exists", () => {
    render(<PrOpenedPanel job={cast(makeJob())} />);
    expect(screen.getByText(/review on github/i)).toBeInTheDocument();
  });

  it("hides GitHub link when no prUrl", () => {
    render(<PrOpenedPanel job={cast(makeJob({ prUrl: null }))} />);
    expect(screen.queryByText(/review on github/i)).not.toBeInTheDocument();
  });
});
