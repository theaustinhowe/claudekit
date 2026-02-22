import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorktreeInfo } from "@/lib/api";
import { WorktreeCard } from "./worktree-card";

// Mock the ChangesDrawer so it doesn't pull in heavy dependencies
vi.mock("./changes-drawer", () => ({
  ChangesDrawer: () => null,
}));

// Mock date-fns for deterministic output
vi.mock("date-fns", () => ({
  formatDistanceToNow: () => "2 hours ago",
}));

// Mock navigator.clipboard
Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn().mockResolvedValue(undefined),
  },
});

function makeWorktree(overrides: Partial<WorktreeInfo> = {}): WorktreeInfo {
  return {
    path: "/home/user/worktrees/agent-issue-42",
    branch: "agent/issue-42-fix-auth",
    commit: "abc123",
    job: {
      id: "job-1",
      issueNumber: 42,
      issueTitle: "Fix authentication bug",
      status: "running",
      prNumber: null,
      prUrl: null,
      updatedAt: "2024-01-01T00:00:00Z",
    },
    repository: {
      id: "repo-1",
      owner: "acme",
      name: "my-project",
      displayName: null,
    },
    ...overrides,
  };
}

describe("WorktreeCard", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the job issue number and title", () => {
    render(<WorktreeCard worktree={makeWorktree()} />);

    expect(screen.getByText("#42")).toBeInTheDocument();
    expect(screen.getByText("Fix authentication bug")).toBeInTheDocument();
  });

  it("renders the branch name", () => {
    render(<WorktreeCard worktree={makeWorktree()} />);

    expect(screen.getByText("agent/issue-42-fix-auth")).toBeInTheDocument();
  });

  it("renders the repository name when available", () => {
    render(<WorktreeCard worktree={makeWorktree()} />);

    expect(screen.getByText("acme/my-project")).toBeInTheDocument();
  });

  it("renders the repository displayName when available", () => {
    render(
      <WorktreeCard
        worktree={makeWorktree({
          repository: { id: "repo-1", owner: "acme", name: "my-project", displayName: "My Cool Project" },
        })}
      />,
    );

    expect(screen.getByText("My Cool Project")).toBeInTheDocument();
  });

  it("renders a status badge for the job", () => {
    render(<WorktreeCard worktree={makeWorktree({ job: { ...makeWorktree().job!, status: "done" } })} />);

    expect(screen.getByText("Done")).toBeInTheDocument();
  });

  it("shows 'No linked job' for orphaned worktrees", () => {
    render(<WorktreeCard worktree={makeWorktree({ job: null })} />);

    expect(screen.getByText("No linked job")).toBeInTheDocument();
  });

  it("shows the branch as title for orphaned worktrees", () => {
    render(<WorktreeCard worktree={makeWorktree({ job: null })} />);

    // The branch should be used as the heading (h3) for orphaned worktrees
    const headings = screen.getAllByText("agent/issue-42-fix-auth");
    const h3 = headings.find((el) => el.tagName === "H3");
    expect(h3).toBeDefined();
  });

  it("renders PR link when prNumber is present", () => {
    const worktree = makeWorktree({
      job: {
        ...makeWorktree().job!,
        prNumber: 99,
        prUrl: "https://github.com/acme/my-project/pull/99",
      },
    });
    render(<WorktreeCard worktree={worktree} />);

    expect(screen.getByText("#99")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /#99/ });
    expect(link).toHaveAttribute("href", "https://github.com/acme/my-project/pull/99");
  });

  it("shows VS Code button", () => {
    render(<WorktreeCard worktree={makeWorktree()} />);

    const vsCodeButton = screen.getByRole("button", { name: /vs code/i });
    expect(vsCodeButton).toBeInTheDocument();
  });

  it("shows Changes button when PR is not merged", () => {
    render(<WorktreeCard worktree={makeWorktree()} prMerged={false} />);

    const changesButton = screen.getByRole("button", { name: /changes/i });
    expect(changesButton).toBeInTheDocument();
  });

  it("hides Changes button when PR is merged", () => {
    render(<WorktreeCard worktree={makeWorktree()} prMerged={true} />);

    expect(screen.queryByRole("button", { name: /changes/i })).not.toBeInTheDocument();
  });

  it("shows Remove button for orphaned worktrees with onCleanupOrphaned", () => {
    const onCleanupOrphaned = vi.fn();
    render(<WorktreeCard worktree={makeWorktree({ job: null })} onCleanupOrphaned={onCleanupOrphaned} />);

    const removeButton = screen.getByRole("button", { name: /remove/i });
    expect(removeButton).toBeInTheDocument();
  });

  it("shows cleanup button for done jobs", () => {
    const onCleanup = vi.fn();
    const worktree = makeWorktree({
      job: { ...makeWorktree().job!, status: "done" },
    });
    render(<WorktreeCard worktree={worktree} onCleanup={onCleanup} />);

    const removeButton = screen.getByRole("button", { name: /remove/i });
    expect(removeButton).toBeInTheDocument();
  });

  it("disables cleanup button for running jobs with tooltip reason", () => {
    const onCleanup = vi.fn();
    const worktree = makeWorktree({
      job: { ...makeWorktree().job!, status: "running" },
    });
    render(<WorktreeCard worktree={worktree} onCleanup={onCleanup} />);

    // The remove button should be disabled (aria-disabled) for running status
    const removeButton = screen.getByRole("button", { name: /remove/i });
    expect(removeButton).toHaveAttribute("aria-disabled", "true");
  });

  it("shows GitHub external link when job and repository are present", () => {
    render(<WorktreeCard worktree={makeWorktree()} />);

    const links = screen.getAllByRole("link");
    const githubLink = links.find((l) => l.getAttribute("href")?.includes("github.com/acme/my-project/issues/42"));
    expect(githubLink).toBeDefined();
  });

  it("shows updated time when job has updatedAt", () => {
    render(<WorktreeCard worktree={makeWorktree()} />);

    expect(screen.getByText(/Updated/)).toBeInTheDocument();
    expect(screen.getByText(/2 hours ago/)).toBeInTheDocument();
  });

  it("truncates long paths", () => {
    const longPath = "/home/user/very/long/path/that/should/be/truncated/for/display/purposes/worktrees/agent-issue-42";
    render(<WorktreeCard worktree={makeWorktree({ path: longPath })} />);

    // The path should be truncated (starts with ...)
    const truncatedElement = screen.getByText(/^\.\.\./);
    expect(truncatedElement).toBeInTheDocument();
  });
});
