import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-jobs", () => ({
  useStaleJobs: vi.fn(),
}));

vi.mock("@devkit/ui", () => ({
  cn: (...args: string[]) => args.filter(Boolean).join(" "),
}));

vi.mock("@devkit/ui/components/button", () => ({
  Button: ({ children, ...props }: { children: ReactNode }) => <button {...props}>{children}</button>,
}));

vi.mock("@devkit/ui/components/collapsible", () => ({
  Collapsible: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CollapsibleContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CollapsibleTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@devkit/ui/components/badge", () => ({
  Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

import { StaleJobsAlert } from "@/components/dashboard/stale-jobs-alert";
import { useStaleJobs } from "@/hooks/use-jobs";

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("StaleJobsAlert", () => {
  afterEach(() => cleanup());
  beforeEach(() => vi.clearAllMocks());

  it("renders nothing when loading", () => {
    vi.mocked(useStaleJobs).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as never);

    const { container } = render(<StaleJobsAlert />, { wrapper: createWrapper() });
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when no stale jobs", () => {
    vi.mocked(useStaleJobs).mockReturnValue({
      data: { data: [] },
      isLoading: false,
    } as never);

    const { container } = render(<StaleJobsAlert />, { wrapper: createWrapper() });
    expect(container.innerHTML).toBe("");
  });

  it("renders stale jobs alert when jobs exist", () => {
    vi.mocked(useStaleJobs).mockReturnValue({
      data: {
        data: [
          {
            id: "job-1",
            issueNumber: 42,
            issueTitle: "Stuck job",
            status: "running",
            updatedAt: new Date(Date.now() - 120 * 60000).toISOString(),
          },
        ],
      },
      isLoading: false,
    } as never);

    render(<StaleJobsAlert />, { wrapper: createWrapper() });
    expect(screen.getByText(/stuck job/i)).toBeInTheDocument();
  });

  it("shows count of stale jobs", () => {
    vi.mocked(useStaleJobs).mockReturnValue({
      data: {
        data: [
          { id: "j1", issueNumber: 1, issueTitle: "Job 1", status: "running", updatedAt: "2024-01-01T00:00:00Z" },
          { id: "j2", issueNumber: 2, issueTitle: "Job 2", status: "needs_info", updatedAt: "2024-01-01T00:00:00Z" },
        ],
      },
      isLoading: false,
    } as never);

    render(<StaleJobsAlert />, { wrapper: createWrapper() });
    expect(screen.getByText(/job 1/i)).toBeInTheDocument();
    expect(screen.getByText(/job 2/i)).toBeInTheDocument();
  });
});
