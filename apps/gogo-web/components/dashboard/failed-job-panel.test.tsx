import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-jobs", () => ({
  useJobAction: () => ({
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

import { FailedJobPanel } from "@/components/dashboard/failed-job-panel";

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

const makeJob = (overrides = {}) => ({
  id: "job-1",
  status: "failed",
  failureReason: "Test suite failed with 3 errors",
  ...overrides,
});

describe("FailedJobPanel", () => {
  afterEach(() => cleanup());

  it("renders retry button", () => {
    render(<FailedJobPanel job={makeJob() as never} />, { wrapper: createWrapper() });
    expect(screen.getByText("Retry Job")).toBeInTheDocument();
  });

  it("shows failure reason", () => {
    render(<FailedJobPanel job={makeJob() as never} />, { wrapper: createWrapper() });
    expect(screen.getByText(/Test suite failed/)).toBeInTheDocument();
  });

  it("shows what happens next section", () => {
    render(<FailedJobPanel job={makeJob() as never} />, { wrapper: createWrapper() });
    expect(screen.getByText(/what happens next/i)).toBeInTheDocument();
  });

  it("handles null failure reason", () => {
    render(<FailedJobPanel job={makeJob({ failureReason: null }) as never} />, { wrapper: createWrapper() });
    expect(screen.getByText("Retry Job")).toBeInTheDocument();
  });
});
