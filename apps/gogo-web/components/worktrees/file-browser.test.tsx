import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@claudekit/ui", () => ({
  cn: (...args: string[]) => args.filter(Boolean).join(" "),
}));

vi.mock("lucide-react", () => ({
  FileCode: () => <span data-testid="icon-modified" />,
  FileMinus: () => <span data-testid="icon-deleted" />,
  FilePlus: () => <span data-testid="icon-added" />,
  FileQuestion: () => <span data-testid="icon-unknown" />,
  FileText: () => <span data-testid="icon-renamed" />,
  Folder: () => <span data-testid="icon-folder" />,
  FolderOpen: () => <span data-testid="icon-folder-open" />,
}));

import { FileBrowser } from "@/components/worktrees/file-browser";
import type { ChangedFile } from "@/lib/api";

describe("FileBrowser", () => {
  afterEach(() => cleanup());

  it("renders empty state when no files", () => {
    render(<FileBrowser files={[]} selectedPath={null} onSelectFile={() => {}} />);
    expect(screen.getByText("No changed files")).toBeInTheDocument();
  });

  it("renders flat files", () => {
    const files: ChangedFile[] = [
      { path: "README.md", status: "modified" },
      { path: "index.ts", status: "added" },
    ];
    render(<FileBrowser files={files} selectedPath={null} onSelectFile={() => {}} />);
    expect(screen.getByText("README.md")).toBeInTheDocument();
    expect(screen.getByText("index.ts")).toBeInTheDocument();
  });

  it("renders nested folder structure", () => {
    const files: ChangedFile[] = [
      { path: "src/components/button.tsx", status: "modified" },
      { path: "src/index.ts", status: "added" },
    ];
    render(<FileBrowser files={files} selectedPath={null} onSelectFile={() => {}} />);
    expect(screen.getByText("src")).toBeInTheDocument();
    expect(screen.getByText("button.tsx")).toBeInTheDocument();
    expect(screen.getByText("index.ts")).toBeInTheDocument();
  });

  it("shows correct status icon for added files", () => {
    const files: ChangedFile[] = [{ path: "new.ts", status: "added" }];
    render(<FileBrowser files={files} selectedPath={null} onSelectFile={() => {}} />);
    expect(screen.getByTestId("icon-added")).toBeInTheDocument();
  });

  it("shows correct status icon for deleted files", () => {
    const files: ChangedFile[] = [{ path: "old.ts", status: "deleted" }];
    render(<FileBrowser files={files} selectedPath={null} onSelectFile={() => {}} />);
    expect(screen.getByTestId("icon-deleted")).toBeInTheDocument();
  });

  it("shows correct status icon for modified files", () => {
    const files: ChangedFile[] = [{ path: "edit.ts", status: "modified" }];
    render(<FileBrowser files={files} selectedPath={null} onSelectFile={() => {}} />);
    expect(screen.getByTestId("icon-modified")).toBeInTheDocument();
  });

  it("shows correct status icon for renamed files", () => {
    const files: ChangedFile[] = [{ path: "moved.ts", status: "renamed" }];
    render(<FileBrowser files={files} selectedPath={null} onSelectFile={() => {}} />);
    expect(screen.getByTestId("icon-renamed")).toBeInTheDocument();
  });

  it("shows correct status icon for copied files", () => {
    const files: ChangedFile[] = [{ path: "copy.ts", status: "copied" }];
    render(<FileBrowser files={files} selectedPath={null} onSelectFile={() => {}} />);
    expect(screen.getByTestId("icon-renamed")).toBeInTheDocument();
  });

  it("shows correct status icon for unknown files", () => {
    const files: ChangedFile[] = [{ path: "mystery.ts", status: "unknown" }];
    render(<FileBrowser files={files} selectedPath={null} onSelectFile={() => {}} />);
    expect(screen.getByTestId("icon-unknown")).toBeInTheDocument();
  });

  it("calls onSelectFile when a file is clicked", () => {
    const onSelect = vi.fn();
    const files: ChangedFile[] = [{ path: "clicked.ts", status: "modified" }];
    render(<FileBrowser files={files} selectedPath={null} onSelectFile={onSelect} />);
    fireEvent.click(screen.getByText("clicked.ts"));
    expect(onSelect).toHaveBeenCalledWith("clicked.ts");
  });

  it("toggles folder collapse on click", () => {
    const files: ChangedFile[] = [{ path: "src/index.ts", status: "modified" }];
    render(<FileBrowser files={files} selectedPath={null} onSelectFile={() => {}} />);

    // Folder should be expanded by default (showing file)
    expect(screen.getByText("index.ts")).toBeInTheDocument();

    // Click folder to collapse
    fireEvent.click(screen.getByText("src"));

    // File should be hidden after collapse
    expect(screen.queryByText("index.ts")).not.toBeInTheDocument();

    // Click folder again to expand
    fireEvent.click(screen.getByText("src"));
    expect(screen.getByText("index.ts")).toBeInTheDocument();
  });

  it("sorts files alphabetically", () => {
    const files: ChangedFile[] = [
      { path: "zebra.ts", status: "added" },
      { path: "alpha.ts", status: "added" },
      { path: "middle.ts", status: "added" },
    ];
    render(<FileBrowser files={files} selectedPath={null} onSelectFile={() => {}} />);
    const buttons = screen.getAllByRole("button");
    const names = buttons.map((b) => b.textContent);
    expect(names).toEqual(["alpha.ts", "middle.ts", "zebra.ts"]);
  });
});
