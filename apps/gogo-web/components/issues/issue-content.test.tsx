import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IssueAuthorInfo, IssueComments, IssueDescription } from "./issue-content";

// Mock date-fns for deterministic output
vi.mock("date-fns", () => ({
  format: () => "Jan 1, 2024 at 12:00 PM",
  formatDistanceToNow: () => "3 days ago",
}));

// Mock next/image
vi.mock("next/image", () => ({
  default: ({ alt, ...props }: { alt: string; src: string; width: number; height: number }) => (
    <img alt={alt} {...props} />
  ),
}));

// Mock react-markdown
vi.mock("react-markdown", () => ({
  default: ({ children }: { children: string }) => <div data-testid="markdown">{children}</div>,
}));

// Mock sonner
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock hooks
const mockCreateCommentMutate = vi.fn();
vi.mock("@/hooks/use-issue-comments", () => ({
  useIssueComments: () => ({
    data: {
      data: [
        {
          id: 1,
          body: "This is a test comment",
          html_url: "https://github.com/acme/repo/issues/1#issuecomment-1",
          user: { login: "testuser", type: "User", avatar_url: "https://github.com/testuser.png" },
          created_at: "2024-01-02T00:00:00Z",
        },
        {
          id: 2,
          body: "Another comment here",
          html_url: "https://github.com/acme/repo/issues/1#issuecomment-2",
          user: null,
          created_at: "2024-01-03T00:00:00Z",
        },
      ],
    },
    isLoading: false,
  }),
  useCreateIssueComment: () => ({
    mutate: mockCreateCommentMutate,
    isPending: false,
  }),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("IssueAuthorInfo", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the author login name", () => {
    render(
      <IssueAuthorInfo
        user={{ login: "johndoe", avatar_url: "https://github.com/johndoe.png", html_url: "https://github.com/johndoe" }}
        createdAt="2024-01-01T00:00:00Z"
      />,
    );

    expect(screen.getByText("johndoe")).toBeInTheDocument();
  });

  it("renders the avatar image", () => {
    render(
      <IssueAuthorInfo
        user={{ login: "johndoe", avatar_url: "https://github.com/johndoe.png", html_url: "https://github.com/johndoe" }}
        createdAt="2024-01-01T00:00:00Z"
      />,
    );

    const img = screen.getByAltText("johndoe");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "https://github.com/johndoe.png");
  });

  it("renders a link to the author profile", () => {
    render(
      <IssueAuthorInfo
        user={{ login: "johndoe", avatar_url: "https://github.com/johndoe.png", html_url: "https://github.com/johndoe" }}
        createdAt="2024-01-01T00:00:00Z"
      />,
    );

    const link = screen.getByRole("link", { name: "johndoe" });
    expect(link).toHaveAttribute("href", "https://github.com/johndoe");
  });

  it("renders the relative creation date", () => {
    render(
      <IssueAuthorInfo
        user={{ login: "johndoe", avatar_url: "https://github.com/johndoe.png", html_url: "https://github.com/johndoe" }}
        createdAt="2024-01-01T00:00:00Z"
      />,
    );

    expect(screen.getByText(/3 days ago/)).toBeInTheDocument();
  });
});

describe("IssueDescription", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the description heading", () => {
    render(<IssueDescription body="Some description text" />);

    expect(screen.getByText("Description")).toBeInTheDocument();
  });

  it("renders the body text when provided", () => {
    render(<IssueDescription body="Some description text" />);

    expect(screen.getByText("Some description text")).toBeInTheDocument();
  });

  it("renders a 'no description' message when body is null", () => {
    render(<IssueDescription body={null} />);

    expect(screen.getByText("No description provided.")).toBeInTheDocument();
  });
});

describe("IssueComments", () => {
  afterEach(() => {
    cleanup();
    mockCreateCommentMutate.mockClear();
  });

  it("renders the comments count", () => {
    render(<IssueComments repositoryId="repo-1" issueNumber={1} />, {
      wrapper: createWrapper(),
    });

    expect(screen.getByText("Comments (2)")).toBeInTheDocument();
  });

  it("renders comment bodies", () => {
    render(<IssueComments repositoryId="repo-1" issueNumber={1} />, {
      wrapper: createWrapper(),
    });

    expect(screen.getByText("This is a test comment")).toBeInTheDocument();
    expect(screen.getByText("Another comment here")).toBeInTheDocument();
  });

  it("renders commenter usernames", () => {
    render(<IssueComments repositoryId="repo-1" issueNumber={1} />, {
      wrapper: createWrapper(),
    });

    expect(screen.getByText("testuser")).toBeInTheDocument();
  });

  it("handles comments with no user (null user)", () => {
    render(<IssueComments repositoryId="repo-1" issueNumber={1} />, {
      wrapper: createWrapper(),
    });

    // Comment with null user should still render its body
    expect(screen.getByText("Another comment here")).toBeInTheDocument();
  });

  it("renders GitHub link when issueUrl is provided", () => {
    render(
      <IssueComments repositoryId="repo-1" issueNumber={1} issueUrl="https://github.com/acme/repo/issues/1" />,
      { wrapper: createWrapper() },
    );

    const githubLink = screen.getByRole("link", { name: /github/i });
    expect(githubLink).toHaveAttribute("href", "https://github.com/acme/repo/issues/1");
  });

  it("does not render GitHub link when issueUrl is not provided", () => {
    render(<IssueComments repositoryId="repo-1" issueNumber={1} />, {
      wrapper: createWrapper(),
    });

    expect(screen.queryByRole("link", { name: /github/i })).not.toBeInTheDocument();
  });

  it("renders the comment input textarea", () => {
    render(<IssueComments repositoryId="repo-1" issueNumber={1} />, {
      wrapper: createWrapper(),
    });

    expect(screen.getByPlaceholderText("Add a comment...")).toBeInTheDocument();
  });

  it("disables Comment button when textarea is empty", () => {
    render(<IssueComments repositoryId="repo-1" issueNumber={1} />, {
      wrapper: createWrapper(),
    });

    const commentButton = screen.getByRole("button", { name: /comment/i });
    expect(commentButton).toBeDisabled();
  });

  it("enables Comment button when textarea has content", () => {
    render(<IssueComments repositoryId="repo-1" issueNumber={1} />, {
      wrapper: createWrapper(),
    });

    const textarea = screen.getByPlaceholderText("Add a comment...");
    fireEvent.change(textarea, { target: { value: "My new comment" } });

    const commentButton = screen.getByRole("button", { name: /comment/i });
    expect(commentButton).not.toBeDisabled();
  });

  it("calls createComment.mutate when submitting", () => {
    render(<IssueComments repositoryId="repo-1" issueNumber={1} />, {
      wrapper: createWrapper(),
    });

    const textarea = screen.getByPlaceholderText("Add a comment...");
    fireEvent.change(textarea, { target: { value: "My new comment" } });

    const commentButton = screen.getByRole("button", { name: /comment/i });
    fireEvent.click(commentButton);

    expect(mockCreateCommentMutate).toHaveBeenCalledWith("My new comment", expect.any(Object));
  });

  it("does not submit when textarea only has whitespace", () => {
    render(<IssueComments repositoryId="repo-1" issueNumber={1} />, {
      wrapper: createWrapper(),
    });

    const textarea = screen.getByPlaceholderText("Add a comment...");
    fireEvent.change(textarea, { target: { value: "   " } });

    const commentButton = screen.getByRole("button", { name: /comment/i });
    expect(commentButton).toBeDisabled();
  });

  it("hides the comment form when showAddComment is false", () => {
    render(<IssueComments repositoryId="repo-1" issueNumber={1} showAddComment={false} />, {
      wrapper: createWrapper(),
    });

    expect(screen.queryByPlaceholderText("Add a comment...")).not.toBeInTheDocument();
  });
});
