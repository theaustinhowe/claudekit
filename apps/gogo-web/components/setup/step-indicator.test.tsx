import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@claudekit/ui", () => ({
  cn: (...args: string[]) => args.filter(Boolean).join(" "),
}));

vi.mock("lucide-react", () => ({
  Check: () => <span data-testid="check-icon" />,
}));

import type { Step } from "@/components/setup/step-indicator";
import { StepIndicator } from "@/components/setup/step-indicator";

const steps: Step[] = [
  { id: 1, title: "GitHub", description: "Connect to GitHub" },
  { id: 2, title: "Repository", description: "Select repository" },
  { id: 3, title: "Workspace", description: "Configure workspace" },
  { id: 4, title: "Review", description: "Review and complete" },
];

describe("StepIndicator", () => {
  afterEach(() => cleanup());

  it("renders all step titles", () => {
    render(<StepIndicator steps={steps} currentStep={1} completedSteps={[]} />);
    expect(screen.getByText("GitHub")).toBeInTheDocument();
    expect(screen.getByText("Repository")).toBeInTheDocument();
    expect(screen.getByText("Workspace")).toBeInTheDocument();
    expect(screen.getByText("Review")).toBeInTheDocument();
  });

  it("shows step number for non-completed steps", () => {
    render(<StepIndicator steps={steps} currentStep={2} completedSteps={[]} />);
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("shows check icon for completed steps", () => {
    render(<StepIndicator steps={steps} currentStep={3} completedSteps={[1, 2]} />);
    const checkIcons = screen.getAllByTestId("check-icon");
    expect(checkIcons).toHaveLength(2);
  });

  it("has progress navigation", () => {
    render(<StepIndicator steps={steps} currentStep={1} completedSteps={[]} />);
    expect(screen.getByRole("navigation", { name: "Progress" })).toBeInTheDocument();
  });

  it("renders correct number of list items", () => {
    render(<StepIndicator steps={steps} currentStep={1} completedSteps={[]} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
  });
});
