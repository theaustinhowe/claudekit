import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DiscoveredRepo, VerifyRepositoryResponse } from "@/lib/api";
import { RepositoryStep } from "./repository-step";
import type { SelectedRepo } from "./setup-wizard";

// Mock the browse directory hook
const mockBrowseMutate = vi.fn();
vi.mock("@/hooks/use-setup", () => ({
  useBrowseDirectory: () => ({
    mutate: mockBrowseMutate,
    isPending: false,
  }),
}));

// Mock lucide-react icons to simple spans
vi.mock("lucide-react", () => ({
  CheckCircle2: (props: Record<string, unknown>) => <span data-testid="check-circle-icon" {...props} />,
  ChevronRight: (props: Record<string, unknown>) => <span data-testid="chevron-right-icon" {...props} />,
  Folder: (props: Record<string, unknown>) => <span data-testid="folder-icon" {...props} />,
  FolderGit2: (props: Record<string, unknown>) => <span data-testid="folder-git-icon" {...props} />,
  FolderOpen: (props: Record<string, unknown>) => <span data-testid="folder-open-icon" {...props} />,
  GitBranch: (props: Record<string, unknown>) => <span data-testid="git-branch-icon" {...props} />,
  Loader2: (props: Record<string, unknown>) => <span data-testid="loader-icon" {...props} />,
  Lock: (props: Record<string, unknown>) => <span data-testid="lock-icon" {...props} />,
  Search: (props: Record<string, unknown>) => <span data-testid="search-icon" {...props} />,
  Tag: (props: Record<string, unknown>) => <span data-testid="tag-icon" {...props} />,
  Trash2: (props: Record<string, unknown>) => <span data-testid="trash-icon" {...props} />,
  XCircle: (props: Record<string, unknown>) => <span data-testid="x-circle-icon" {...props} />,
}));

function makeDefaultProps(overrides: Partial<React.ComponentProps<typeof RepositoryStep>> = {}) {
  return {
    selectedRepos: [] as SelectedRepo[],
    existingRepoKeys: new Set<string>(),
    onToggleRepo: vi.fn(),
    onUpdateRepo: vi.fn(),
    onRemoveRepo: vi.fn(),
    onBack: vi.fn(),
    onContinue: vi.fn(),
    isVerifying: false,
    verificationResults: new Map<string, VerifyRepositoryResponse>(),
    verifyError: null,
    discoveryPath: "",
    onDiscoveryPathChange: vi.fn(),
    onDiscoveryPathSelect: vi.fn(),
    onDiscover: vi.fn(),
    isDiscovering: false,
    discoveredRepos: [] as DiscoveredRepo[],
    discoveryError: null,
    ...overrides,
  };
}

describe("RepositoryStep", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the title and description", () => {
    render(<RepositoryStep {...makeDefaultProps()} />);

    expect(screen.getByText("Select Repositories")).toBeInTheDocument();
    expect(screen.getByText("Choose the GitHub repositories that the agent will work on")).toBeInTheDocument();
  });

  it("renders the discovery path input", () => {
    render(<RepositoryStep {...makeDefaultProps({ discoveryPath: "/home/user/projects" })} />);

    const input = screen.getByPlaceholderText("~/Documents or /path/to/projects");
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue("/home/user/projects");
  });

  it("calls onDiscoveryPathChange when the input value changes", () => {
    const onDiscoveryPathChange = vi.fn();
    render(<RepositoryStep {...makeDefaultProps({ onDiscoveryPathChange })} />);

    const input = screen.getByPlaceholderText("~/Documents or /path/to/projects");
    fireEvent.change(input, { target: { value: "/new/path" } });
    expect(onDiscoveryPathChange).toHaveBeenCalledWith("/new/path");
  });

  it("disables the Scan button when discoveryPath is empty", () => {
    render(<RepositoryStep {...makeDefaultProps({ discoveryPath: "" })} />);

    const scanButton = screen.getByRole("button", { name: /scan/i });
    expect(scanButton).toBeDisabled();
  });

  it("enables the Scan button when discoveryPath is provided", () => {
    render(<RepositoryStep {...makeDefaultProps({ discoveryPath: "/some/path" })} />);

    const scanButton = screen.getByRole("button", { name: /scan/i });
    expect(scanButton).not.toBeDisabled();
  });

  it("disables the Scan button when isDiscovering is true", () => {
    render(<RepositoryStep {...makeDefaultProps({ discoveryPath: "/some/path", isDiscovering: true })} />);

    const scanButton = screen.getByRole("button", { name: /scan/i });
    expect(scanButton).toBeDisabled();
  });

  it("calls onDiscover when Scan button is clicked", () => {
    const onDiscover = vi.fn();
    render(<RepositoryStep {...makeDefaultProps({ discoveryPath: "/some/path", onDiscover })} />);

    const scanButton = screen.getByRole("button", { name: /scan/i });
    fireEvent.click(scanButton);
    expect(onDiscover).toHaveBeenCalledTimes(1);
  });

  it("displays discovery error when discoveryError is set", () => {
    render(<RepositoryStep {...makeDefaultProps({ discoveryError: "Directory not found" })} />);

    expect(screen.getByText("Directory not found")).toBeInTheDocument();
  });

  it("renders discovered repos with GitHub remotes", () => {
    const discoveredRepos: DiscoveredRepo[] = [
      { path: "/home/user/project-a", owner: "acme", name: "project-a", remoteUrl: "git@github.com:acme/project-a.git", currentBranch: "main" },
      { path: "/home/user/project-b", owner: "acme", name: "project-b", remoteUrl: "git@github.com:acme/project-b.git", currentBranch: "develop" },
    ];
    render(<RepositoryStep {...makeDefaultProps({ discoveredRepos })} />);

    expect(screen.getByText("Found Repositories (2)")).toBeInTheDocument();
    expect(screen.getByText("acme/project-a")).toBeInTheDocument();
    expect(screen.getByText("acme/project-b")).toBeInTheDocument();
  });

  it("filters out repos without GitHub remotes", () => {
    const discoveredRepos: DiscoveredRepo[] = [
      { path: "/home/user/local-only", owner: null, name: null, remoteUrl: null, currentBranch: "main" },
    ];
    render(<RepositoryStep {...makeDefaultProps({ discoveredRepos })} />);

    // Should show the "no GitHub remotes" message
    expect(screen.getByText(/none have GitHub remotes configured/)).toBeInTheDocument();
  });

  it("marks existing repos as disabled with 'Already added' text", () => {
    const discoveredRepos: DiscoveredRepo[] = [
      { path: "/home/user/project-a", owner: "acme", name: "project-a", remoteUrl: "git@github.com:acme/project-a.git", currentBranch: "main" },
    ];
    const existingRepoKeys = new Set(["acme/project-a"]);
    render(<RepositoryStep {...makeDefaultProps({ discoveredRepos, existingRepoKeys })} />);

    expect(screen.getByText("Already added")).toBeInTheDocument();
  });

  it("calls onToggleRepo when a non-existing repo is clicked", () => {
    const onToggleRepo = vi.fn();
    const discoveredRepos: DiscoveredRepo[] = [
      { path: "/home/user/project-a", owner: "acme", name: "project-a", remoteUrl: "git@github.com:acme/project-a.git", currentBranch: "main" },
    ];
    render(<RepositoryStep {...makeDefaultProps({ discoveredRepos, onToggleRepo })} />);

    fireEvent.click(screen.getByText("acme/project-a"));
    expect(onToggleRepo).toHaveBeenCalledWith(discoveredRepos[0]);
  });

  it("does not call onToggleRepo for existing repos", () => {
    const onToggleRepo = vi.fn();
    const discoveredRepos: DiscoveredRepo[] = [
      { path: "/home/user/project-a", owner: "acme", name: "project-a", remoteUrl: "git@github.com:acme/project-a.git", currentBranch: "main" },
    ];
    const existingRepoKeys = new Set(["acme/project-a"]);
    render(<RepositoryStep {...makeDefaultProps({ discoveredRepos, existingRepoKeys, onToggleRepo })} />);

    fireEvent.click(screen.getByText("acme/project-a"));
    expect(onToggleRepo).not.toHaveBeenCalled();
  });

  it("renders selected repos section when repos are selected", () => {
    const selectedRepos: SelectedRepo[] = [
      { owner: "acme", name: "project-a", triggerLabel: "agent", baseBranch: "main" },
    ];
    render(<RepositoryStep {...makeDefaultProps({ selectedRepos })} />);

    expect(screen.getByText("Selected Repositories (1)")).toBeInTheDocument();
    expect(screen.getByText("acme/project-a")).toBeInTheDocument();
  });

  it("disables Continue button when no repos are selected", () => {
    render(<RepositoryStep {...makeDefaultProps({ selectedRepos: [] })} />);

    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("enables Continue button when repos are selected", () => {
    const selectedRepos: SelectedRepo[] = [
      { owner: "acme", name: "project-a", triggerLabel: "agent", baseBranch: "main" },
    ];
    render(<RepositoryStep {...makeDefaultProps({ selectedRepos })} />);

    expect(screen.getByRole("button", { name: "Continue" })).not.toBeDisabled();
  });

  it("disables Continue button when isVerifying is true", () => {
    const selectedRepos: SelectedRepo[] = [
      { owner: "acme", name: "project-a", triggerLabel: "agent", baseBranch: "main" },
    ];
    render(<RepositoryStep {...makeDefaultProps({ selectedRepos, isVerifying: true })} />);

    const button = screen.getByRole("button", { name: /verifying/i });
    expect(button).toBeDisabled();
  });

  it("calls onBack when Back button is clicked", () => {
    const onBack = vi.fn();
    render(<RepositoryStep {...makeDefaultProps({ onBack })} />);

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("calls onContinue when Continue button is clicked", () => {
    const onContinue = vi.fn();
    const selectedRepos: SelectedRepo[] = [
      { owner: "acme", name: "project-a", triggerLabel: "agent", baseBranch: "main" },
    ];
    render(<RepositoryStep {...makeDefaultProps({ selectedRepos, onContinue })} />);

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it("displays verify error message", () => {
    render(<RepositoryStep {...makeDefaultProps({ verifyError: "Token is invalid" })} />);

    expect(screen.getByText("Token is invalid")).toBeInTheDocument();
  });

  it("shows verification failure for a specific repo", () => {
    const selectedRepos: SelectedRepo[] = [
      { owner: "acme", name: "project-a", triggerLabel: "agent", baseBranch: "main" },
    ];
    const verificationResults = new Map<string, VerifyRepositoryResponse>([
      ["acme/project-a", { success: false, error: "Repo not found" }],
    ]);
    render(<RepositoryStep {...makeDefaultProps({ selectedRepos, verificationResults })} />);

    expect(screen.getByText("Repo not found")).toBeInTheDocument();
  });
});
