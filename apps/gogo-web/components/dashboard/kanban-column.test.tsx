import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@devkit/ui/components/scroll-area", () => ({
  ScrollArea: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/dashboard/job-card", () => ({
  JobCard: ({ job }: { job: { issueTitle: string } }) => <div data-testid="job-card">{job.issueTitle}</div>,
}));

import { KanbanColumn } from "@/components/dashboard/kanban-column";

const group = {
  id: "active",
  label: "Active",
  color: "text-blue-500",
  statuses: ["running", "needs_info"],
};

const jobs = [
  { id: "j1", issueTitle: "Job 1", status: "running" },
  { id: "j2", issueTitle: "Job 2", status: "needs_info" },
  { id: "j3", issueTitle: "Job 3", status: "completed" },
];

describe("KanbanColumn", () => {
  afterEach(() => cleanup());

  it("renders column label and count", () => {
    render(<KanbanColumn group={group as never} jobs={jobs as never[]} onJobClick={vi.fn()} />);
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("filters jobs by group statuses", () => {
    render(<KanbanColumn group={group as never} jobs={jobs as never[]} onJobClick={vi.fn()} />);
    expect(screen.getAllByTestId("job-card")).toHaveLength(2);
    expect(screen.getByText("Job 1")).toBeInTheDocument();
    expect(screen.getByText("Job 2")).toBeInTheDocument();
  });

  it("shows empty state when no jobs match", () => {
    render(<KanbanColumn group={group as never} jobs={[]} onJobClick={vi.fn()} />);
    expect(screen.getByText("No jobs")).toBeInTheDocument();
  });

  it("renders compact mode without column wrapper", () => {
    render(<KanbanColumn group={group as never} jobs={jobs as never[]} onJobClick={vi.fn()} compact />);
    expect(screen.queryByText("Active")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("job-card")).toHaveLength(2);
  });
});
