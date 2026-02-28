import { cast } from "@claudekit/test-utils";
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
  CardHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: ReactNode }) => <h3>{children}</h3>,
}));

vi.mock("@claudekit/ui/components/progress", () => ({
  Progress: ({ value }: { value: number }) => <div data-testid="progress" data-value={value} />,
}));

import { ReadyToPrPanel } from "@/components/dashboard/ready-to-pr-panel";

const makeJob = (overrides = {}) => ({
  id: "job-1",
  status: "ready_to_pr",
  testRetryCount: 0,
  lastTestOutput: null,
  changeSummary: null,
  ...overrides,
});

describe("ReadyToPrPanel", () => {
  afterEach(() => cleanup());

  it("renders running tests label for first attempt", () => {
    render(<ReadyToPrPanel job={cast(makeJob())} onCreatePr={vi.fn()} isPending={false} />);
    expect(screen.getByText("Running Tests")).toBeInTheDocument();
  });

  it("shows progress indicator", () => {
    render(<ReadyToPrPanel job={cast(makeJob())} onCreatePr={vi.fn()} isPending={false} />);
    expect(screen.getByTestId("progress")).toBeInTheDocument();
  });

  it("shows fixing label when retrying with test output", () => {
    render(
      <ReadyToPrPanel
        job={cast(makeJob({ testRetryCount: 1, lastTestOutput: "FAIL: test.ts" }))}
        onCreatePr={vi.fn()}
        isPending={false}
      />,
    );
    expect(screen.getByText("Fixing Issues")).toBeInTheDocument();
  });

  it("shows attempt badge when retrying", () => {
    render(
      <ReadyToPrPanel
        job={cast(makeJob({ testRetryCount: 2, lastTestOutput: "FAIL" }))}
        onCreatePr={vi.fn()}
        isPending={false}
      />,
    );
    expect(screen.getByText(/attempt 3/i)).toBeInTheDocument();
  });

  it("shows change summary when available", () => {
    render(
      <ReadyToPrPanel
        job={cast(makeJob({ changeSummary: "Fixed login bug" }))}
        onCreatePr={vi.fn()}
        isPending={false}
      />,
    );
    expect(screen.getByText("Fixed login bug")).toBeInTheDocument();
  });

  it("shows trigger PR button when not pending", () => {
    render(<ReadyToPrPanel job={cast(makeJob())} onCreatePr={vi.fn()} isPending={false} />);
    expect(screen.getByText("Trigger PR Creation")).toBeInTheDocument();
  });

  it("hides trigger PR button when pending", () => {
    render(<ReadyToPrPanel job={cast(makeJob())} onCreatePr={vi.fn()} isPending={true} />);
    expect(screen.queryByText("Trigger PR Creation")).not.toBeInTheDocument();
  });
});
