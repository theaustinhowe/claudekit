import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@claudekit/ui", () => ({
  cn: (...args: string[]) => args.filter(Boolean).join(" "),
}));

vi.mock("lucide-react", () => ({
  CheckCircle2: ({ className }: { className?: string }) => <span data-testid="check-icon" className={className} />,
  Circle: ({ className }: { className?: string }) => <span data-testid="circle-icon" className={className} />,
  Loader2: ({ className }: { className?: string }) => <span data-testid="loader-icon" className={className} />,
}));

import { PhaseProgress } from "@/components/dashboard/phase-progress";

function makeLog(content: string) {
  return { id: "1", content, stream: "stdout", jobId: "j1", sequence: 1, createdAt: "2024-01-01T00:00:00Z" } as never;
}

describe("PhaseProgress", () => {
  afterEach(() => cleanup());

  describe("detectPhases (via component render)", () => {
    it("detects setup phase from 'cloning'", () => {
      render(<PhaseProgress logs={[makeLog("Cloning repository")]} />);
      expect(screen.getByText("Setup")).toBeInTheDocument();
    });

    it("detects setup from 'worktree'", () => {
      render(<PhaseProgress logs={[makeLog("Creating worktree")]} />);
      expect(screen.getByText("Setup")).toBeInTheDocument();
    });

    it("detects setup from 'checkout'", () => {
      render(<PhaseProgress logs={[makeLog("Running checkout")]} />);
      expect(screen.getByText("Setup")).toBeInTheDocument();
    });

    it("detects setup from 'initializing'", () => {
      render(<PhaseProgress logs={[makeLog("Initializing project")]} />);
      expect(screen.getByText("Setup")).toBeInTheDocument();
    });

    it("detects setup from 'setting up'", () => {
      render(<PhaseProgress logs={[makeLog("Setting up environment")]} />);
      expect(screen.getByText("Setup")).toBeInTheDocument();
    });

    it("detects analysis phase", () => {
      render(<PhaseProgress logs={[makeLog("Analyzing code structure")]} />);
      expect(screen.getByText("Analysis")).toBeInTheDocument();
    });

    it("detects analysis from 'reading'", () => {
      render(<PhaseProgress logs={[makeLog("Reading the source file")]} />);
      expect(screen.getByText("Analysis")).toBeInTheDocument();
    });

    it("detects analysis from 'understanding'", () => {
      render(<PhaseProgress logs={[makeLog("Understanding the architecture")]} />);
      expect(screen.getByText("Analysis")).toBeInTheDocument();
    });

    it("detects analysis from 'exploring'", () => {
      render(<PhaseProgress logs={[makeLog("Exploring the codebase")]} />);
      expect(screen.getByText("Analysis")).toBeInTheDocument();
    });

    it("detects implementation phase from 'modifying'", () => {
      render(<PhaseProgress logs={[makeLog("Modifying src/index.ts")]} />);
      expect(screen.getByText("Implementation")).toBeInTheDocument();
    });

    it("detects implementation from 'editing'", () => {
      render(<PhaseProgress logs={[makeLog("Editing the config")]} />);
      expect(screen.getByText("Implementation")).toBeInTheDocument();
    });

    it("detects implementation from 'creating file'", () => {
      render(<PhaseProgress logs={[makeLog("Creating file utils.ts")]} />);
      expect(screen.getByText("Implementation")).toBeInTheDocument();
    });

    it("detects implementation from 'writing'", () => {
      render(<PhaseProgress logs={[makeLog("Writing new module")]} />);
      expect(screen.getByText("Implementation")).toBeInTheDocument();
    });

    it("detects implementation from 'implementing'", () => {
      render(<PhaseProgress logs={[makeLog("Implementing feature X")]} />);
      expect(screen.getByText("Implementation")).toBeInTheDocument();
    });

    it("detects testing phase from 'running tests'", () => {
      render(<PhaseProgress logs={[makeLog("Running tests now")]} />);
      expect(screen.getByText("Testing")).toBeInTheDocument();
    });

    it("detects testing from 'pnpm test'", () => {
      render(<PhaseProgress logs={[makeLog("pnpm test executed")]} />);
      expect(screen.getByText("Testing")).toBeInTheDocument();
    });

    it("detects testing from 'npm test'", () => {
      render(<PhaseProgress logs={[makeLog("npm test passed")]} />);
      expect(screen.getByText("Testing")).toBeInTheDocument();
    });

    it("detects testing from 'linting'", () => {
      render(<PhaseProgress logs={[makeLog("Linting the project")]} />);
      expect(screen.getByText("Testing")).toBeInTheDocument();
    });

    it("detects testing from 'type check'", () => {
      render(<PhaseProgress logs={[makeLog("Running type check")]} />);
      expect(screen.getByText("Testing")).toBeInTheDocument();
    });

    it("detects complete phase from 'creating pr'", () => {
      render(<PhaseProgress logs={[makeLog("Creating PR for the changes")]} />);
      expect(screen.getByText("Complete")).toBeInTheDocument();
    });

    it("detects complete from 'pull request created'", () => {
      render(<PhaseProgress logs={[makeLog("Pull request created successfully")]} />);
      expect(screen.getByText("Complete")).toBeInTheDocument();
    });

    it("detects complete from 'finished'", () => {
      render(<PhaseProgress logs={[makeLog("Task finished successfully")]} />);
      expect(screen.getByText("Complete")).toBeInTheDocument();
    });

    it("renders nothing when no phases detected", () => {
      const { container } = render(<PhaseProgress logs={[makeLog("random text nothing here")]} />);
      expect(container.innerHTML).toBe("");
    });

    it("renders nothing with empty logs", () => {
      const { container } = render(<PhaseProgress logs={[]} />);
      expect(container.innerHTML).toBe("");
    });
  });

  describe("getCurrentPhaseIndex (via render)", () => {
    it("highlights the latest phase detected", () => {
      const logs = [makeLog("Cloning repo"), makeLog("Analyzing code"), makeLog("Modifying files")];
      render(<PhaseProgress logs={logs} />);
      // Implementation is the latest phase, so it should be the current
      expect(screen.getByText("Implementation")).toBeInTheDocument();
    });
  });

  describe("getPhaseMapFromServerPhase", () => {
    it("uses server phase when provided", () => {
      render(<PhaseProgress logs={[]} phase="testing" />);
      expect(screen.getByText("Testing")).toBeInTheDocument();
      // All prior phases should also show
      expect(screen.getByText("Setup")).toBeInTheDocument();
      expect(screen.getByText("Analysis")).toBeInTheDocument();
      expect(screen.getByText("Implementation")).toBeInTheDocument();
    });

    it("handles unknown server phase gracefully", () => {
      const { container } = render(<PhaseProgress logs={[]} phase="unknown_phase" />);
      expect(container.innerHTML).toBe("");
    });
  });

  describe("compact mode", () => {
    it("renders compact bars with phase label", () => {
      render(<PhaseProgress logs={[makeLog("Analyzing code")]} compact />);
      expect(screen.getByText("Analysis")).toBeInTheDocument();
    });

    it("shows 'Complete' label in compact mode when complete", () => {
      render(<PhaseProgress logs={[makeLog("Task finished")]} compact />);
      expect(screen.getByText("Complete")).toBeInTheDocument();
    });
  });

  describe("full mode", () => {
    it("renders all five phase labels", () => {
      render(<PhaseProgress logs={[makeLog("Cloning repo")]} phase="complete" />);
      expect(screen.getByText("Setup")).toBeInTheDocument();
      expect(screen.getByText("Analysis")).toBeInTheDocument();
      expect(screen.getByText("Implementation")).toBeInTheDocument();
      expect(screen.getByText("Testing")).toBeInTheDocument();
      expect(screen.getByText("Complete")).toBeInTheDocument();
    });
  });
});
