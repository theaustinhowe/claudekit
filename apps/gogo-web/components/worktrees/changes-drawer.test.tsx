import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  fetchChangedFiles: vi.fn(),
  fetchChangedFilesByPath: vi.fn(),
  fetchFileDiff: vi.fn(),
  fetchFileDiffByPath: vi.fn(),
}));

vi.mock("@claudekit/ui/components/button", () => ({
  Button: ({ children, ...props }: { children: ReactNode }) => <button {...props}>{children}</button>,
}));

vi.mock("@claudekit/ui/components/diff-viewer", () => ({
  DiffViewer: ({ patch }: { patch: string }) => <pre data-testid="diff-viewer">{patch}</pre>,
}));

vi.mock("@claudekit/ui/components/scroll-area", () => ({
  ScrollArea: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@claudekit/ui/components/sheet", () => ({
  Sheet: ({ children, open }: { children: ReactNode; open: boolean }) =>
    open ? <div data-testid="sheet">{children}</div> : null,
  SheetContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  SheetBody: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@claudekit/ui/components/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TooltipContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TooltipProvider: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("./file-browser", () => ({
  FileBrowser: ({ files, selectedPath }: { files: { path: string }[]; selectedPath: string | null }) => (
    <div data-testid="file-browser">
      {files.map((f) => (
        <span key={f.path} data-selected={f.path === selectedPath}>
          {f.path}
        </span>
      ))}
    </div>
  ),
}));

import { ChangesDrawer } from "@/components/worktrees/changes-drawer";
import { fetchChangedFiles, fetchFileDiff } from "@/lib/api";

describe("ChangesDrawer", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when closed", () => {
    render(<ChangesDrawer jobId="job-1" title="Changes" open={false} onOpenChange={vi.fn()} />);

    expect(screen.queryByTestId("sheet")).not.toBeInTheDocument();
  });

  it("shows title when open", async () => {
    vi.mocked(fetchChangedFiles).mockResolvedValue({
      files: [],
      baseBranch: "main",
    });

    render(<ChangesDrawer jobId="job-1" title="Job Changes" open={true} onOpenChange={vi.fn()} />);

    expect(screen.getByText("Job Changes")).toBeInTheDocument();
  });

  it("shows loading state then files", async () => {
    vi.mocked(fetchChangedFiles).mockResolvedValue({
      files: [
        { path: "src/index.ts", status: "modified" },
        { path: "src/utils.ts", status: "added" },
      ],
      baseBranch: "main",
    });
    vi.mocked(fetchFileDiff).mockResolvedValue({
      diff: "@@ -1 +1 @@\n-old\n+new",
      filePath: "src/index.ts",
      baseBranch: "main",
    });

    render(<ChangesDrawer jobId="job-1" title="Changes" open={true} onOpenChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Changed Files (2)")).toBeInTheDocument();
    });
  });

  it("shows error when fetch fails", async () => {
    vi.mocked(fetchChangedFiles).mockResolvedValue({
      files: [],
      baseBranch: "main",
      error: "Worktree not found",
    });

    render(<ChangesDrawer jobId="job-1" title="Changes" open={true} onOpenChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Worktree not found")).toBeInTheDocument();
    });
  });

  it("shows no changes state", async () => {
    vi.mocked(fetchChangedFiles).mockResolvedValue({
      files: [],
      baseBranch: "develop",
    });

    render(<ChangesDrawer jobId="job-1" title="Changes" open={true} onOpenChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("No changes detected")).toBeInTheDocument();
    });

    expect(screen.getByText("This workspace has no file changes compared to develop.")).toBeInTheDocument();
  });

  it("shows base branch comparison", async () => {
    vi.mocked(fetchChangedFiles).mockResolvedValue({
      files: [],
      baseBranch: "develop",
    });

    render(<ChangesDrawer jobId="job-1" title="Changes" open={true} onOpenChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Comparing to develop")).toBeInTheDocument();
    });
  });
});
