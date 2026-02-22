import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockCreateJob = vi.fn();

vi.mock("@/hooks/use-jobs", () => ({
  useCreateManualJob: () => ({
    mutate: mockCreateJob,
    isPending: false,
  }),
}));

vi.mock("@/hooks/use-repositories", () => ({
  useRepositories: () => ({
    data: [
      { id: "repo-1", owner: "org", name: "repo1", isActive: true, displayName: "org/repo1" },
      { id: "repo-2", owner: "org", name: "repo2", isActive: true, displayName: "org/repo2" },
      { id: "repo-3", owner: "org", name: "repo3", isActive: false, displayName: "org/repo3" },
    ],
  }),
}));

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("@claudekit/ui/components/button", () => ({
  Button: ({ children, ...props }: { children: ReactNode } & Record<string, unknown>) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock("@claudekit/ui/components/dialog", () => ({
  Dialog: ({ children }: { children: ReactNode }) => <div data-testid="dialog">{children}</div>,
  DialogBody: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  DialogTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@claudekit/ui/components/input", () => ({
  Input: (props: Record<string, unknown>) => <input {...props} />,
}));

vi.mock("@claudekit/ui/components/label", () => ({
  // biome-ignore lint/a11y/noLabelWithoutControl: test mock
  Label: ({ children, ...props }: { children: ReactNode }) => <label {...props}>{children}</label>,
}));

vi.mock("@claudekit/ui/components/select", () => ({
  Select: ({
    children,
    value,
    _onValueChange,
  }: {
    children: ReactNode;
    value: string;
    _onValueChange: (v: string) => void;
  }) => (
    <div data-testid="select" data-value={value}>
      {children}
    </div>
  ),
  SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
    <option value={value}>{children}</option>
  ),
  SelectTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectValue: ({ placeholder }: { placeholder: string }) => <span>{placeholder}</span>,
}));

vi.mock("@claudekit/ui/components/textarea", () => ({
  Textarea: (props: Record<string, unknown>) => <textarea {...props} />,
}));

import { CreateManualJobDialog } from "@/components/dashboard/create-manual-job-dialog";

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("CreateManualJobDialog", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders trigger button", () => {
    render(<CreateManualJobDialog />, { wrapper: createWrapper() });

    expect(screen.getByText("New Job")).toBeInTheDocument();
  });

  it("opens dialog when trigger clicked", () => {
    render(<CreateManualJobDialog />, { wrapper: createWrapper() });

    // Click the trigger button
    screen.getByText("New Job").click();

    expect(screen.getByText("Create Manual Job")).toBeInTheDocument();
    expect(
      screen.getByText("Create a job without a GitHub issue. The agent will work in a worktree and can create PRs."),
    ).toBeInTheDocument();
  });

  it("shows repository selector when no defaultRepositoryId", () => {
    render(<CreateManualJobDialog />, { wrapper: createWrapper() });
    screen.getByText("New Job").click();

    expect(screen.getByText("Repository")).toBeInTheDocument();
  });

  it("shows repo badge when defaultRepositoryId is provided", () => {
    render(<CreateManualJobDialog defaultRepositoryId="repo-1" />, { wrapper: createWrapper() });
    screen.getByText("New Job").click();

    expect(screen.getByText("org/repo1")).toBeInTheDocument();
  });

  it("renders form fields", () => {
    render(<CreateManualJobDialog defaultRepositoryId="repo-1" />, { wrapper: createWrapper() });
    screen.getByText("New Job").click();

    expect(screen.getByPlaceholderText("What should the agent do?")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Additional context, requirements, or constraints...")).toBeInTheDocument();
  });

  it("has cancel button", () => {
    render(<CreateManualJobDialog defaultRepositoryId="repo-1" />, { wrapper: createWrapper() });
    screen.getByText("New Job").click();

    expect(screen.getByText("Cancel")).toBeInTheDocument();
    expect(screen.getByText("Create Job")).toBeInTheDocument();
  });
});
