import { cast } from "@claudekit/test-utils";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RepoSelector } from "./repo-selector";

// Mock next/link
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; onClick?: () => void }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Shared mock state for repository context
const mockSetSelectedRepoId = vi.fn();
let mockContextValue = {
  repositories: [
    { id: "repo-1", owner: "acme", name: "project-a", displayName: "Project Alpha" },
    { id: "repo-2", owner: "acme", name: "project-b", displayName: null },
  ],
  selectedRepoId: "all" as string,
  setSelectedRepoId: mockSetSelectedRepoId,
  selectedRepository: null,
  isLoading: false,
};

vi.mock("@/contexts/repository-context", () => ({
  useRepositoryContext: () => mockContextValue,
}));

describe("RepoSelector", () => {
  afterEach(() => {
    cleanup();
    mockSetSelectedRepoId.mockClear();
    mockContextValue = {
      repositories: [
        { id: "repo-1", owner: "acme", name: "project-a", displayName: "Project Alpha" },
        { id: "repo-2", owner: "acme", name: "project-b", displayName: null },
      ],
      selectedRepoId: "all",
      setSelectedRepoId: mockSetSelectedRepoId,
      selectedRepository: null,
      isLoading: false,
    };
  });

  it("renders 'All Repositories' when selectedRepoId is 'all'", () => {
    render(<RepoSelector />);

    expect(screen.getByText("All Repositories")).toBeInTheDocument();
  });

  it("renders the selected repo name when a specific repo is selected", () => {
    mockContextValue = {
      ...mockContextValue,
      selectedRepoId: "repo-1",
      selectedRepository: cast(mockContextValue.repositories[0]),
    };
    render(<RepoSelector />);

    expect(screen.getByText("Project Alpha")).toBeInTheDocument();
  });

  it("falls back to owner/name when displayName is null", () => {
    mockContextValue = {
      ...mockContextValue,
      selectedRepoId: "repo-2",
      selectedRepository: cast(mockContextValue.repositories[1]),
    };
    render(<RepoSelector />);

    expect(screen.getByText("acme/project-b")).toBeInTheDocument();
  });

  it("opens dropdown when button is clicked", () => {
    render(<RepoSelector />);

    const button = screen.getByRole("button", { name: /all repositories/i });
    fireEvent.click(button);

    // Dropdown should show repo options
    const listbox = screen.getByRole("listbox");
    expect(listbox).toBeInTheDocument();
  });

  it("shows all repositories in the dropdown", () => {
    render(<RepoSelector />);

    const button = screen.getByRole("button", { name: /all repositories/i });
    fireEvent.click(button);

    expect(screen.getByText("Project Alpha")).toBeInTheDocument();
    expect(screen.getByText("acme/project-b")).toBeInTheDocument();
  });

  it("shows 'Add repository...' link in the dropdown", () => {
    render(<RepoSelector />);

    const button = screen.getByRole("button", { name: /all repositories/i });
    fireEvent.click(button);

    const addLink = screen.getByText("Add repository...");
    expect(addLink).toBeInTheDocument();
    expect(addLink.closest("a")).toHaveAttribute("href", "/setup");
  });

  it("calls setSelectedRepoId when a repository is selected", () => {
    render(<RepoSelector />);

    const button = screen.getByRole("button", { name: /all repositories/i });
    fireEvent.click(button);

    fireEvent.click(screen.getByText("Project Alpha"));
    expect(mockSetSelectedRepoId).toHaveBeenCalledWith("repo-1");
  });

  it("calls setSelectedRepoId with 'all' when All Repositories option is clicked", () => {
    mockContextValue = {
      ...mockContextValue,
      selectedRepoId: "repo-1",
    };
    render(<RepoSelector />);

    const button = screen.getByRole("button");
    fireEvent.click(button);

    // Click the "All Repositories" option in the dropdown
    const options = screen.getAllByRole("option");
    const allOption = options.find((o) => o.textContent?.includes("All Repositories"));
    if (allOption) {
      fireEvent.click(allOption);
    }
    expect(mockSetSelectedRepoId).toHaveBeenCalledWith("all");
  });

  it("shows repo count in the dropdown", () => {
    render(<RepoSelector />);

    const button = screen.getByRole("button", { name: /all repositories/i });
    fireEvent.click(button);

    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("disables button when isLoading is true", () => {
    mockContextValue = { ...mockContextValue, isLoading: true };
    render(<RepoSelector />);

    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
  });

  it("renders simplified display for single repository", () => {
    mockContextValue = {
      ...mockContextValue,
      repositories: [{ id: "repo-1", owner: "acme", name: "project-a", displayName: "Project Alpha" }],
      selectedRepoId: "repo-1",
    };
    render(<RepoSelector />);

    expect(screen.getByText("Project Alpha")).toBeInTheDocument();
  });

  it("renders collapsed mode with first letter when collapsed", () => {
    mockContextValue = {
      ...mockContextValue,
      selectedRepoId: "repo-1",
    };
    render(<RepoSelector collapsed />);

    expect(screen.getByText("P")).toBeInTheDocument();
  });

  it("renders 'A' in collapsed mode when all repos selected", () => {
    render(<RepoSelector collapsed />);

    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("shows 'No repository' when there are no repos (single repo mode)", () => {
    mockContextValue = {
      ...mockContextValue,
      repositories: [],
    };
    render(<RepoSelector />);

    expect(screen.getByText("No repository")).toBeInTheDocument();
  });
});
