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

vi.mock("@devkit/ui/components/dialog", () => ({
  Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogBody: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  DialogTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@devkit/ui/components/textarea", () => ({
  Textarea: (props: Record<string, unknown>) => <textarea {...props} />,
}));

import { InjectModal } from "@/components/dashboard/inject-modal";

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("InjectModal", () => {
  afterEach(() => cleanup());

  it("renders trigger button", () => {
    render(<InjectModal jobId="job-1" />, { wrapper: createWrapper() });
    expect(screen.getAllByText("Guide Agent").length).toBeGreaterThanOrEqual(1);
  });

  it("renders dialog content", () => {
    render(<InjectModal jobId="job-1" />, { wrapper: createWrapper() });
    // Trigger button + dialog title both say "Guide Agent"
    expect(screen.getAllByText("Guide Agent").length).toBeGreaterThanOrEqual(2);
  });

  it("shows mode selection buttons", () => {
    render(<InjectModal jobId="job-1" />, { wrapper: createWrapper() });
    expect(screen.getByText("Immediate")).toBeInTheDocument();
    expect(screen.getByText("Queued")).toBeInTheDocument();
  });

  it("shows send button", () => {
    render(<InjectModal jobId="job-1" />, { wrapper: createWrapper() });
    expect(screen.getByText("Send")).toBeInTheDocument();
  });
});
