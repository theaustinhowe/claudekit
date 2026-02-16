import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-repositories", () => ({
  useRepositories: () => ({
    data: [
      { id: "repo-1", name: "frontend", owner: "org", displayName: "Frontend App" },
      { id: "repo-2", name: "backend", owner: "org", displayName: "Backend API" },
    ],
    isLoading: false,
  }),
}));

vi.mock("@devkit/ui/components/button", () => ({
  Button: ({ children, ...props }: { children: ReactNode }) => <button {...props}>{children}</button>,
}));

vi.mock("@devkit/ui/components/card", () => ({
  Card: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@devkit/ui/components/skeleton", () => ({
  Skeleton: () => <div data-testid="skeleton" />,
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

vi.mock("@/components/repo/repo-settings", () => ({
  RepoSettings: ({ repository }: { repository: { displayName: string } }) => (
    <div data-testid="repo-settings">{repository.displayName}</div>
  ),
}));

import { RepositoriesSettings } from "@/components/settings/repositories-settings";

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("RepositoriesSettings", () => {
  afterEach(() => cleanup());

  it("renders repository settings heading", () => {
    render(<RepositoriesSettings />, { wrapper: createWrapper() });
    expect(screen.getByText("Repository Settings")).toBeInTheDocument();
  });

  it("shows add repository button", () => {
    render(<RepositoriesSettings />, { wrapper: createWrapper() });
    expect(screen.getByText("Add Repository")).toBeInTheDocument();
  });

  it("renders repository list", () => {
    render(<RepositoriesSettings />, { wrapper: createWrapper() });
    expect(screen.getAllByTestId("repo-settings")).toHaveLength(2);
  });
});
