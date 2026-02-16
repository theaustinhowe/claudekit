import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-jobs", () => ({
  useApprovePlan: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}));

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

vi.mock("@devkit/ui/components/button", () => ({
  Button: ({ children, ...props }: { children: ReactNode }) => <button {...props}>{children}</button>,
}));

vi.mock("@devkit/ui/components/textarea", () => ({
  Textarea: (props: Record<string, unknown>) => <textarea {...props} />,
}));

vi.mock("@devkit/ui/components/scroll-area", () => ({
  ScrollArea: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

import { PlanApprovalPanel } from "@/components/dashboard/plan-approval-panel";

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("PlanApprovalPanel", () => {
  afterEach(() => cleanup());

  it("renders plan content", () => {
    render(
      <PlanApprovalPanel
        jobId="job-1"
        planContent="## Step 1\nImplement the fix"
        issueUrl="https://github.com/org/repo/issues/1"
        source="github_issue"
      />,
      { wrapper: createWrapper() },
    );
    expect(screen.getByText(/Step 1/)).toBeInTheDocument();
  });

  it("shows approve button", () => {
    render(<PlanApprovalPanel jobId="job-1" planContent="The plan" issueUrl="" source="manual" />, {
      wrapper: createWrapper(),
    });
    expect(screen.getByText("Approve Plan")).toBeInTheDocument();
  });

  it("shows request changes button", () => {
    render(<PlanApprovalPanel jobId="job-1" planContent="The plan" issueUrl="" source="manual" />, {
      wrapper: createWrapper(),
    });
    expect(screen.getByText("Request Changes")).toBeInTheDocument();
  });

  it("handles null plan content", () => {
    render(<PlanApprovalPanel jobId="job-1" planContent={null} issueUrl="" source="manual" />, {
      wrapper: createWrapper(),
    });
    expect(screen.getByText("Approve Plan")).toBeInTheDocument();
  });
});
