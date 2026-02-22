import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-jobs", () => ({
  useResumeAgent: () => ({
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

vi.mock("@claudekit/ui/components/textarea", () => ({
  Textarea: (props: Record<string, unknown>) => <textarea {...props} />,
}));

import { NeedsInfoPanel } from "@/components/dashboard/needs-info-panel";

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("NeedsInfoPanel", () => {
  afterEach(() => cleanup());

  it("renders agent question", () => {
    render(
      <NeedsInfoPanel
        jobId="job-1"
        question="What database should I use?"
        issueUrl="https://github.com/org/repo/issues/1"
      />,
      { wrapper: createWrapper() },
    );
    expect(screen.getByText("What database should I use?")).toBeInTheDocument();
  });

  it("shows resume agent button", () => {
    render(<NeedsInfoPanel jobId="job-1" question="A question" issueUrl="https://github.com/org/repo/issues/1" />, {
      wrapper: createWrapper(),
    });
    expect(screen.getByText("Resume Agent")).toBeInTheDocument();
  });

  it("shows latest response when provided", () => {
    render(
      <NeedsInfoPanel
        jobId="job-1"
        question="A question"
        issueUrl="https://github.com/org/repo/issues/1"
        latestResponse={{ message: "Use PostgreSQL", user: "reviewer" }}
      />,
      { wrapper: createWrapper() },
    );
    expect(screen.getByText(/Use PostgreSQL/)).toBeInTheDocument();
  });

  it("handles null question", () => {
    render(<NeedsInfoPanel jobId="job-1" question={null} issueUrl="https://github.com/org/repo/issues/1" />, {
      wrapper: createWrapper(),
    });
    expect(screen.getByText("Resume Agent")).toBeInTheDocument();
  });
});
