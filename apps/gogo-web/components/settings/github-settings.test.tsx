import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-settings", () => ({
  useSettings: () => ({
    data: { personalAccessToken: "ghp_test123" },
  }),
  useUpdateSettings: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}));

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

vi.mock("@devkit/ui/components/button", () => ({
  Button: ({ children, ...props }: { children: ReactNode }) => <button {...props}>{children}</button>,
}));

vi.mock("@devkit/ui/components/card", () => ({
  Card: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  CardHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: ReactNode }) => <h3>{children}</h3>,
}));

vi.mock("@devkit/ui/components/input", () => ({
  Input: (props: Record<string, unknown>) => <input {...props} />,
}));

vi.mock("@devkit/ui/components/label", () => ({
  Label: ({ children, ...props }: { children: ReactNode }) => <label {...props}>{children}</label>,
}));

vi.mock("@devkit/ui/components/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TooltipContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TooltipProvider: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

import { GitHubSettings } from "@/components/settings/github-settings";

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("GitHubSettings", () => {
  afterEach(() => cleanup());

  it("renders github integration card", () => {
    render(<GitHubSettings />, { wrapper: createWrapper() });
    expect(screen.getByText("GitHub Integration")).toBeInTheDocument();
  });

  it("shows personal access token field", () => {
    render(<GitHubSettings />, { wrapper: createWrapper() });
    expect(screen.getByText("Personal Access Token")).toBeInTheDocument();
  });

  it("shows save button", () => {
    render(<GitHubSettings />, { wrapper: createWrapper() });
    expect(screen.getByText("Save Token")).toBeInTheDocument();
  });

  it("shows token placeholder", () => {
    render(<GitHubSettings />, { wrapper: createWrapper() });
    expect(screen.getByPlaceholderText("ghp_xxxxxxxxxxxx")).toBeInTheDocument();
  });
});
