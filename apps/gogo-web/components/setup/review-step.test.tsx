import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@devkit/ui/components/button", () => ({
  Button: ({ children, onClick, disabled }: { children: ReactNode; onClick?: () => void; disabled?: boolean }) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

vi.mock("@devkit/ui/components/card", () => ({
  Card: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  CardHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: ReactNode }) => <h3>{children}</h3>,
}));

vi.mock("lucide-react", () => ({
  CheckCircle2: () => <span />,
  FolderGit2: () => <span />,
  FolderOpen: () => <span />,
  Github: () => <span />,
  Loader2: () => <span />,
  Rocket: () => <span />,
}));

import { ReviewStep } from "@/components/setup/review-step";

const defaultProps = {
  githubUsername: "testuser",
  selectedRepos: [{ owner: "org", name: "repo1", triggerLabel: "agent", baseBranch: "main" }],
  workspacePath: "/tmp/work",
  onBack: vi.fn(),
  onComplete: vi.fn(),
  isCompleting: false,
  error: null,
};

describe("ReviewStep", () => {
  afterEach(() => cleanup());

  it("renders Review & Complete heading", () => {
    render(<ReviewStep {...defaultProps} />);
    expect(screen.getByText("Review & Complete")).toBeInTheDocument();
  });

  it("shows GitHub username", () => {
    render(<ReviewStep {...defaultProps} />);
    expect(screen.getByText("testuser")).toBeInTheDocument();
  });

  it("shows repository owner/name", () => {
    render(<ReviewStep {...defaultProps} />);
    expect(screen.getByText("org")).toBeInTheDocument();
    expect(screen.getByText("/")).toBeInTheDocument();
    expect(screen.getByText("repo1")).toBeInTheDocument();
  });

  it("shows workspace path", () => {
    render(<ReviewStep {...defaultProps} />);
    expect(screen.getByText("/tmp/work")).toBeInTheDocument();
  });

  it("shows trigger label", () => {
    render(<ReviewStep {...defaultProps} />);
    expect(screen.getByText("agent")).toBeInTheDocument();
  });

  it("shows base branch", () => {
    render(<ReviewStep {...defaultProps} />);
    expect(screen.getByText("main")).toBeInTheDocument();
  });

  it("shows error message when error is present", () => {
    render(<ReviewStep {...defaultProps} error="Setup failed" />);
    expect(screen.getByText("Setup failed")).toBeInTheDocument();
  });

  it("does not show error when null", () => {
    render(<ReviewStep {...defaultProps} />);
    expect(screen.queryByText("Setup failed")).not.toBeInTheDocument();
  });

  it("calls onBack when back button clicked", () => {
    const onBack = vi.fn();
    render(<ReviewStep {...defaultProps} onBack={onBack} />);
    fireEvent.click(screen.getByText("Back"));
    expect(onBack).toHaveBeenCalled();
  });

  it("calls onComplete when complete button clicked", () => {
    const onComplete = vi.fn();
    render(<ReviewStep {...defaultProps} onComplete={onComplete} />);
    fireEvent.click(screen.getByText("Complete Setup"));
    expect(onComplete).toHaveBeenCalled();
  });

  it("disables buttons when completing", () => {
    render(<ReviewStep {...defaultProps} isCompleting />);
    expect(screen.getByText("Back")).toBeDisabled();
    expect(screen.getByText("Completing Setup").closest("button")).toBeDisabled();
  });

  it("shows repository count for multiple repos", () => {
    const repos = [
      { owner: "org", name: "repo1", triggerLabel: "agent", baseBranch: "main" },
      { owner: "org", name: "repo2", triggerLabel: "agent", baseBranch: "develop" },
    ];
    render(<ReviewStep {...defaultProps} selectedRepos={repos} />);
    expect(screen.getByText("Repositories (2)")).toBeInTheDocument();
  });

  it("shows singular 'Repository' for single repo", () => {
    render(<ReviewStep {...defaultProps} />);
    expect(screen.getByText("Repository")).toBeInTheDocument();
  });

  it("shows 'What happens next' section", () => {
    render(<ReviewStep {...defaultProps} />);
    expect(screen.getByText("What happens next?")).toBeInTheDocument();
  });
});
