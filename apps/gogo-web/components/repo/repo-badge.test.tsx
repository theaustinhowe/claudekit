import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockRepoContext = vi.fn();

vi.mock("@/contexts/repository-context", () => ({
  useRepositoryContext: () => mockRepoContext(),
}));

vi.mock("@claudekit/ui/components/badge", () => ({
  Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

vi.mock("@claudekit/ui/components/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TooltipContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

import { RepoBadge } from "@/components/repo/repo-badge";

describe("RepoBadge", () => {
  afterEach(() => cleanup());

  it("shows repo name when viewing all repos", () => {
    mockRepoContext.mockReturnValue({
      selectedRepoId: "all",
      repositories: [{ id: "repo-1", name: "frontend", owner: "org", displayName: "Frontend" }],
    });
    render(<RepoBadge repositoryId="repo-1" />);
    expect(screen.getByText("Frontend")).toBeInTheDocument();
  });

  it("returns null when viewing single repo", () => {
    mockRepoContext.mockReturnValue({
      selectedRepoId: "repo-1",
      repositories: [{ id: "repo-1", name: "frontend", owner: "org", displayName: "Frontend" }],
    });
    const { container } = render(<RepoBadge repositoryId="repo-1" />);
    expect(container.innerHTML).toBe("");
  });

  it("returns null when no repositoryId", () => {
    mockRepoContext.mockReturnValue({
      selectedRepoId: "all",
      repositories: [],
    });
    const { container } = render(<RepoBadge repositoryId={null} />);
    expect(container.innerHTML).toBe("");
  });

  it("returns null when repo not found", () => {
    mockRepoContext.mockReturnValue({
      selectedRepoId: "all",
      repositories: [],
    });
    const { container } = render(<RepoBadge repositoryId="missing-repo" />);
    expect(container.innerHTML).toBe("");
  });
});
