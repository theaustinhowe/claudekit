import { cast } from "@claudekit/test-utils";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockSubscribeToJob = vi.fn();
const mockUnsubscribeFromJob = vi.fn();

vi.mock("@/contexts/websocket-context", () => ({
  useWebSocketContext: () => ({
    subscribeToJob: mockSubscribeToJob,
    unsubscribeFromJob: mockUnsubscribeFromJob,
  }),
}));

vi.mock("@/hooks/use-jobs", () => ({
  useJobLogs: vi.fn(),
}));

vi.mock("@claudekit/ui", () => ({
  cn: (...args: string[]) => args.filter(Boolean).join(" "),
}));

vi.mock("@claudekit/ui/components/button", () => ({
  Button: ({ children, ...props }: { children: ReactNode }) => <button {...props}>{children}</button>,
}));

vi.mock("@claudekit/ui/components/scroll-area", () => ({
  ScrollArea: ({ children }: { children: ReactNode }) => <div data-testid="scroll-area">{children}</div>,
}));

vi.mock("@claudekit/ui/components/tabs", () => ({
  Tabs: ({
    children,
    value,
    _onValueChange,
  }: {
    children: ReactNode;
    value: string;
    _onValueChange: (v: string) => void;
  }) => (
    <div data-testid="tabs" data-value={value}>
      {children}
    </div>
  ),
  TabsList: ({ children }: { children: ReactNode }) => <div data-testid="tabs-list">{children}</div>,
  TabsTrigger: ({ children, value, ...props }: { children: ReactNode; value: string }) => (
    <button data-testid={`tab-${value}`} {...props}>
      {children}
    </button>
  ),
}));

import { LogViewer } from "@/components/dashboard/log-viewer";
import { useJobLogs } from "@/hooks/use-jobs";

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("LogViewer", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading state", () => {
    vi.mocked(useJobLogs).mockReturnValue(
      cast({
        data: [],
        isLoading: true,
      }),
    );

    render(<LogViewer jobId="job-1" />, { wrapper: createWrapper() });

    expect(screen.getByText("Loading logs...")).toBeInTheDocument();
  });

  it("shows empty state when no logs", () => {
    vi.mocked(useJobLogs).mockReturnValue(
      cast({
        data: [],
        isLoading: false,
      }),
    );

    render(<LogViewer jobId="job-1" />, { wrapper: createWrapper() });

    expect(
      screen.getByText("Waiting for agent output\u2026 Logs will appear here once the agent starts running."),
    ).toBeInTheDocument();
  });

  it("renders log entries", () => {
    vi.mocked(useJobLogs).mockReturnValue(
      cast({
        data: [
          { id: "log-1", stream: "stdout", content: "Hello from agent", createdAt: "2024-01-01T00:00:00Z" },
          { id: "log-2", stream: "stderr", content: "Error occurred", createdAt: "2024-01-01T00:00:01Z" },
        ],
        isLoading: false,
      }),
    );

    render(<LogViewer jobId="job-1" />, { wrapper: createWrapper() });

    expect(screen.getByText("Hello from agent")).toBeInTheDocument();
    expect(screen.getByText("Error occurred")).toBeInTheDocument();
  });

  it("renders filter tabs with counts", () => {
    vi.mocked(useJobLogs).mockReturnValue(
      cast({
        data: [
          { id: "log-1", stream: "stdout", content: "line1", createdAt: "2024-01-01T00:00:00Z" },
          { id: "log-2", stream: "stderr", content: "err1", createdAt: "2024-01-01T00:00:01Z" },
          { id: "log-3", stream: "system", content: "sys1", createdAt: "2024-01-01T00:00:02Z" },
        ],
        isLoading: false,
      }),
    );

    render(<LogViewer jobId="job-1" />, { wrapper: createWrapper() });

    expect(screen.getByTestId("tab-all")).toHaveTextContent("All (3)");
    expect(screen.getByTestId("tab-stdout")).toHaveTextContent("stdout (1)");
    expect(screen.getByTestId("tab-stderr")).toHaveTextContent("stderr (1)");
    expect(screen.getByTestId("tab-system")).toHaveTextContent("system (1)");
  });

  it("subscribes and unsubscribes from WebSocket", () => {
    vi.mocked(useJobLogs).mockReturnValue(
      cast({
        data: [],
        isLoading: false,
      }),
    );

    const { unmount } = render(<LogViewer jobId="job-42" />, { wrapper: createWrapper() });

    expect(mockSubscribeToJob).toHaveBeenCalledWith("job-42");

    unmount();
    expect(mockUnsubscribeFromJob).toHaveBeenCalledWith("job-42");
  });

  it("shows error count when stderr logs exist", () => {
    vi.mocked(useJobLogs).mockReturnValue(
      cast({
        data: [
          { id: "log-1", stream: "stderr", content: "err1", createdAt: "2024-01-01T00:00:00Z" },
          { id: "log-2", stream: "stderr", content: "err2", createdAt: "2024-01-01T00:00:01Z" },
        ],
        isLoading: false,
      }),
    );

    render(<LogViewer jobId="job-1" />, { wrapper: createWrapper() });

    expect(screen.getByText("2 errors")).toBeInTheDocument();
  });
});
