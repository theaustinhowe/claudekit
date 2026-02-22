import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@claudekit/ui", () => ({
  cn: (...args: string[]) => args.filter(Boolean).join(" "),
}));

vi.mock("lucide-react", () => ({
  Terminal: () => <span data-testid="terminal-icon" />,
}));

vi.mock("@/hooks/use-jobs", () => ({
  useJobLogs: vi.fn(),
}));

import { LogPreview } from "@/components/dashboard/log-preview";
import { useJobLogs } from "@/hooks/use-jobs";

function makeLog(id: string, content: string, stream = "stdout") {
  return { id, content, stream, jobId: "j1", sequence: 1, createdAt: "2024-01-01T00:00:00Z" } as never;
}

describe("LogPreview", () => {
  afterEach(() => cleanup());

  it("renders nothing when no logs", () => {
    vi.mocked(useJobLogs).mockReturnValue({ data: [] } as never);

    const { container } = render(<LogPreview jobId="j1" />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when all logs are too short", () => {
    vi.mocked(useJobLogs).mockReturnValue({
      data: [makeLog("1", "ab"), makeLog("2", "cd")],
    } as never);

    const { container } = render(<LogPreview jobId="j1" />);
    expect(container.innerHTML).toBe("");
  });

  it("renders log lines", () => {
    vi.mocked(useJobLogs).mockReturnValue({
      data: [makeLog("1", "Hello world output line"), makeLog("2", "Another meaningful line")],
    } as never);

    render(<LogPreview jobId="j1" />);
    expect(screen.getByText("Hello world output line")).toBeInTheDocument();
    expect(screen.getByText("Another meaningful line")).toBeInTheDocument();
  });

  it("strips ANSI escape codes", () => {
    vi.mocked(useJobLogs).mockReturnValue({
      data: [makeLog("1", "\u001b[31mRed text here\u001b[0m")],
    } as never);

    render(<LogPreview jobId="j1" />);
    expect(screen.getByText("Red text here")).toBeInTheDocument();
  });

  it("collapses multiple spaces", () => {
    vi.mocked(useJobLogs).mockReturnValue({
      data: [makeLog("1", "word    with     spaces")],
    } as never);

    render(<LogPreview jobId="j1" />);
    expect(screen.getByText("word with spaces")).toBeInTheDocument();
  });

  it("respects maxLines prop", () => {
    vi.mocked(useJobLogs).mockReturnValue({
      data: [
        makeLog("1", "Line one output here"),
        makeLog("2", "Line two output here"),
        makeLog("3", "Line three output here"),
      ],
    } as never);

    render(<LogPreview jobId="j1" maxLines={2} />);
    expect(screen.queryByText("Line one output here")).not.toBeInTheDocument();
    expect(screen.getByText("Line two output here")).toBeInTheDocument();
    expect(screen.getByText("Line three output here")).toBeInTheDocument();
  });

  it("shows 'Recent output' header", () => {
    vi.mocked(useJobLogs).mockReturnValue({
      data: [makeLog("1", "Some meaningful output text")],
    } as never);

    render(<LogPreview jobId="j1" />);
    expect(screen.getByText("Recent output")).toBeInTheDocument();
  });

  it("filters out very short lines (3 chars or less)", () => {
    vi.mocked(useJobLogs).mockReturnValue({
      data: [makeLog("1", "ok"), makeLog("2", "A longer meaningful line")],
    } as never);

    render(<LogPreview jobId="j1" />);
    expect(screen.queryByText("ok")).not.toBeInTheDocument();
    expect(screen.getByText("A longer meaningful line")).toBeInTheDocument();
  });
});
