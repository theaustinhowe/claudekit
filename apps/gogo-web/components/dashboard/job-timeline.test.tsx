import type { JobEvent } from "@claudekit/gogo-shared";
import { cast } from "@claudekit/test-utils";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@claudekit/ui", () => ({
  cn: (...args: string[]) => args.filter(Boolean).join(" "),
}));

vi.mock("lucide-react", () => ({
  CheckCircle2: ({ className }: { className?: string }) => <span data-testid="check-icon" className={className} />,
  Circle: ({ className }: { className?: string }) => <span data-testid="circle-icon" className={className} />,
  Clock: ({ className }: { className?: string }) => <span data-testid="clock-icon" className={className} />,
  Eye: ({ className }: { className?: string }) => <span data-testid="eye-icon" className={className} />,
  GitPullRequest: ({ className }: { className?: string }) => <span data-testid="pr-icon" className={className} />,
  Loader2: ({ className }: { className?: string }) => <span data-testid="loader-icon" className={className} />,
  PauseCircle: ({ className }: { className?: string }) => <span data-testid="pause-icon" className={className} />,
  XCircle: ({ className }: { className?: string }) => <span data-testid="x-icon" className={className} />,
}));

import { JobTimeline } from "@/components/dashboard/job-timeline";

function makeEvent(toStatus: string, createdAt: string) {
  return cast<JobEvent>({
    id: `evt-${toStatus}`,
    jobId: "job-1",
    eventType: "state_change",
    fromStatus: null,
    toStatus,
    message: `Transitioned to ${toStatus}`,
    metadata: null,
    createdAt,
  });
}

describe("JobTimeline", () => {
  afterEach(() => cleanup());

  it("renders all milestone labels", () => {
    render(<JobTimeline events={[]} createdAt="2024-01-01T00:00:00Z" />);
    expect(screen.getByText("Created")).toBeInTheDocument();
    expect(screen.getByText("Started")).toBeInTheDocument();
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.getByText("PR")).toBeInTheDocument();
    expect(screen.getByText("Review")).toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();
  });

  it("renders Job Progress heading", () => {
    render(<JobTimeline events={[]} createdAt="2024-01-01T00:00:00Z" />);
    expect(screen.getByText("Job Progress")).toBeInTheDocument();
  });

  it("marks milestones as reached based on events", () => {
    const events = [makeEvent("running", "2024-01-01T00:10:00Z"), makeEvent("ready_to_pr", "2024-01-01T00:30:00Z")];
    render(<JobTimeline events={events} createdAt="2024-01-01T00:00:00Z" />);
    // Should show duration markers
    expect(screen.getByText("+10 minutes")).toBeInTheDocument();
    expect(screen.getByText("+20 minutes")).toBeInTheDocument();
  });

  it("shows failed status indicator", () => {
    render(<JobTimeline events={[]} createdAt="2024-01-01T00:00:00Z" currentStatus="failed" />);
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  it("shows paused status indicator", () => {
    render(<JobTimeline events={[]} createdAt="2024-01-01T00:00:00Z" currentStatus="paused" />);
    expect(screen.getByText("Paused")).toBeInTheDocument();
  });

  it("does not show failed/paused indicators for running status", () => {
    render(<JobTimeline events={[]} createdAt="2024-01-01T00:00:00Z" currentStatus="running" />);
    expect(screen.queryByText("Failed")).not.toBeInTheDocument();
    expect(screen.queryByText("Paused")).not.toBeInTheDocument();
  });

  it("computes full timeline with done state", () => {
    const events = [
      makeEvent("running", "2024-01-01T00:05:00Z"),
      makeEvent("ready_to_pr", "2024-01-01T00:15:00Z"),
      makeEvent("pr_opened", "2024-01-01T00:16:00Z"),
      makeEvent("pr_reviewing", "2024-01-01T00:20:00Z"),
      makeEvent("done", "2024-01-01T00:25:00Z"),
    ];
    render(<JobTimeline events={events} createdAt="2024-01-01T00:00:00Z" currentStatus="done" />);
    // All milestone labels should be present
    expect(screen.getByText("Created")).toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();
  });

  it("ignores non-state_change events", () => {
    const events = [
      cast<JobEvent>({
        id: "evt-1",
        jobId: "job-1",
        eventType: "log",
        fromStatus: null,
        toStatus: "running",
        message: "Log event",
        metadata: null,
        createdAt: "2024-01-01T00:10:00Z",
      }),
    ];
    render(<JobTimeline events={events} createdAt="2024-01-01T00:00:00Z" />);
    // Without state_change events, no duration markers should show
    expect(screen.queryByText(/\+/)).not.toBeInTheDocument();
  });
});
