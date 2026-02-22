import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-jobs", () => ({
  useResumeAgent: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  useJobAction: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}));

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
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

vi.mock("@claudekit/ui/components/badge", () => ({
  Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

vi.mock("@/components/dashboard/inject-modal", () => ({
  InjectModal: () => <button type="button">Guide Agent</button>,
}));

import { PausedJobPanel } from "@/components/dashboard/paused-job-panel";

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

const makeJob = (overrides = {}) => ({
  id: "job-1",
  status: "paused",
  pauseReason: "User requested pause",
  ...overrides,
});

describe("PausedJobPanel", () => {
  afterEach(() => cleanup());

  it("renders resume button", () => {
    render(<PausedJobPanel job={makeJob() as never} />, { wrapper: createWrapper() });
    expect(screen.getByRole("button", { name: /resume/i })).toBeInTheDocument();
  });

  it("shows pause reason", () => {
    render(<PausedJobPanel job={makeJob() as never} />, { wrapper: createWrapper() });
    expect(screen.getByText(/user requested pause/i)).toBeInTheDocument();
  });

  it("shows inject modal", () => {
    render(<PausedJobPanel job={makeJob() as never} />, { wrapper: createWrapper() });
    expect(screen.getByText("Guide Agent")).toBeInTheDocument();
  });

  it("shows orchestrator badge for orchestrator restarts", () => {
    render(<PausedJobPanel job={makeJob({ pauseReason: "Orchestrator restart" }) as never} />, {
      wrapper: createWrapper(),
    });
    expect(screen.getByText("Orchestrator restarted")).toBeInTheDocument();
  });
});
