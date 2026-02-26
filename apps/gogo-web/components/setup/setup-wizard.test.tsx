import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/hooks/use-repositories", () => ({
  useRepositories: () => ({ data: [], isLoading: false }),
}));

vi.mock("@/hooks/use-settings", () => ({
  useSettings: () => ({ data: null, isLoading: false }),
}));

vi.mock("@/hooks/use-setup", () => ({
  useSetupStatus: () => ({ data: { needsSetup: true, repositoryCount: 0, hasEnvToken: false } }),
  useVerifyGitHub: () => ({ mutate: vi.fn(), isPending: false }),
  useDiscoverRepos: () => ({ mutate: vi.fn(), isPending: false }),
  useVerifyRepository: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useVerifyWorkspace: () => ({ mutate: vi.fn(), isPending: false }),
  useCompleteSetup: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));

// Mock child step components to simplify testing — use full module paths
vi.mock("@/components/setup/github-step", () => ({
  GitHubStep: ({ onContinue }: { onContinue: () => void }) => (
    <div data-testid="github-step">
      <button onClick={onContinue} type="button">
        Continue GitHub
      </button>
    </div>
  ),
}));

vi.mock("@/components/setup/repository-step", () => ({
  RepositoryStep: ({ onContinue, onBack }: { onContinue: () => void; onBack: () => void }) => (
    <div data-testid="repository-step">
      <button onClick={onBack} type="button">
        Back
      </button>
      <button onClick={onContinue} type="button">
        Continue Repo
      </button>
    </div>
  ),
}));

vi.mock("@/components/setup/workspace-step", () => ({
  WorkspaceStep: ({ onContinue, onBack }: { onContinue: () => void; onBack: () => void }) => (
    <div data-testid="workspace-step">
      <button onClick={onBack} type="button">
        Back
      </button>
      <button onClick={onContinue} type="button">
        Continue Workspace
      </button>
    </div>
  ),
}));

vi.mock("@/components/setup/review-step", () => ({
  ReviewStep: ({ onComplete, onBack }: { onComplete: () => void; onBack: () => void }) => (
    <div data-testid="review-step">
      <button onClick={onBack} type="button">
        Back
      </button>
      <button onClick={onComplete} type="button">
        Complete
      </button>
    </div>
  ),
}));

vi.mock("@/components/setup/step-indicator", () => ({
  StepIndicator: ({ currentStep, completedSteps }: { currentStep: number; completedSteps: number[] }) => (
    <div data-testid="step-indicator" data-current-step={currentStep} data-completed={completedSteps.join(",")}>
      Step {currentStep} of 4
    </div>
  ),
}));

import { SetupWizard } from "@/components/setup/setup-wizard";

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("SetupWizard", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("renders step indicator", () => {
    render(<SetupWizard />, { wrapper: createWrapper() });

    expect(screen.getByTestId("step-indicator")).toBeInTheDocument();
  });

  it("starts on GitHub step (step 1)", () => {
    render(<SetupWizard />, { wrapper: createWrapper() });

    expect(screen.getByTestId("step-indicator")).toHaveAttribute("data-current-step", "1");
    expect(screen.getByTestId("github-step")).toBeInTheDocument();
  });

  it("does not show repository step initially", () => {
    render(<SetupWizard />, { wrapper: createWrapper() });

    expect(screen.queryByTestId("repository-step")).not.toBeInTheDocument();
  });

  it("does not show workspace step initially", () => {
    render(<SetupWizard />, { wrapper: createWrapper() });

    expect(screen.queryByTestId("workspace-step")).not.toBeInTheDocument();
  });

  it("does not show review step initially", () => {
    render(<SetupWizard />, { wrapper: createWrapper() });

    expect(screen.queryByTestId("review-step")).not.toBeInTheDocument();
  });
});
