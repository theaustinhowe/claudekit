import type { Job } from "@claudekit/gogo-shared";
import { cast } from "@claudekit/test-utils";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@claudekit/ui", () => ({
  cn: (...args: string[]) => args.filter(Boolean).join(" "),
  formatNumber: (n: number) => String(n),
}));

vi.mock("@claudekit/ui/components/badge", () => ({
  Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

vi.mock("@claudekit/ui/components/button", () => ({
  Button: ({ children, onClick, ...props }: { children: ReactNode; onClick?: () => void }) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

vi.mock("lucide-react", () => ({
  AlertCircle: () => <span />,
  CheckCircle2: () => <span />,
  Filter: () => <span />,
}));

vi.mock("@/contexts/repository-context", () => ({
  useRepositoryContext: () => ({ selectedRepoId: "repo-1" }),
}));

vi.mock("./create-manual-job-dialog", () => ({
  CreateManualJobDialog: () => <div data-testid="create-job-dialog" />,
}));

import { JobFilters } from "@/components/dashboard/job-filters";

function makeJob(status: string) {
  return cast<Job>({ id: `job-${status}`, status });
}

describe("JobFilters", () => {
  afterEach(() => cleanup());

  it("shows correct active count", () => {
    const jobs = [makeJob("running"), makeJob("queued"), makeJob("done"), makeJob("needs_info")];
    render(<JobFilters jobs={jobs} activeFilter="active" onFilterChange={() => {}} />);
    // Active: running + queued = 2 (not done, not attention states)
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("shows correct attention count", () => {
    const jobs = [makeJob("needs_info"), makeJob("failed"), makeJob("paused"), makeJob("running")];
    render(<JobFilters jobs={jobs} activeFilter="active" onFilterChange={() => {}} />);
    // Attention: needs_info + failed + paused = 3
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("shows correct completed count", () => {
    const jobs = [makeJob("done"), makeJob("done"), makeJob("running")];
    render(<JobFilters jobs={jobs} activeFilter="active" onFilterChange={() => {}} />);
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("calls onFilterChange when active filter clicked", () => {
    const onFilterChange = vi.fn();
    render(<JobFilters jobs={[]} activeFilter="active" onFilterChange={onFilterChange} />);
    fireEvent.click(screen.getByText("Active"));
    expect(onFilterChange).toHaveBeenCalledWith("active");
  });

  it("calls onFilterChange when attention filter clicked", () => {
    const onFilterChange = vi.fn();
    render(<JobFilters jobs={[]} activeFilter="active" onFilterChange={onFilterChange} />);
    fireEvent.click(screen.getByText("Attention"));
    expect(onFilterChange).toHaveBeenCalledWith("attention");
  });

  it("shows blocked-on-you indicator when needs_info jobs exist", () => {
    const jobs = [makeJob("needs_info"), makeJob("needs_info")];
    render(<JobFilters jobs={jobs} activeFilter="active" onFilterChange={() => {}} />);
    expect(screen.getByText("2 blocked on you")).toBeInTheDocument();
  });

  it("hides blocked-on-you indicator when no needs_info jobs", () => {
    const jobs = [makeJob("running"), makeJob("done")];
    render(<JobFilters jobs={jobs} activeFilter="active" onFilterChange={() => {}} />);
    expect(screen.queryByText(/blocked on you/)).not.toBeInTheDocument();
  });

  it("renders create manual job dialog", () => {
    render(<JobFilters jobs={[]} activeFilter="active" onFilterChange={() => {}} />);
    expect(screen.getByTestId("create-job-dialog")).toBeInTheDocument();
  });
});
