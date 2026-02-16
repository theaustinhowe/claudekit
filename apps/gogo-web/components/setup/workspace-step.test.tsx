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

vi.mock("@devkit/ui/components/input", () => ({
  Input: ({ value, onChange, ...props }: { value?: string; onChange?: (e: unknown) => void }) => (
    <input value={value} onChange={onChange} data-testid="path-input" {...props} />
  ),
}));

vi.mock("@devkit/ui/components/label", () => ({
  Label: ({ children }: { children: ReactNode }) => <label>{children}</label>,
}));

vi.mock("lucide-react", () => ({
  FolderOpen: () => <span />,
  Loader2: () => <span />,
  XCircle: () => <span />,
}));

import { WorkspaceStep } from "@/components/setup/workspace-step";

const defaultProps = {
  path: "",
  onPathChange: vi.fn(),
  onContinue: vi.fn(),
  onBack: vi.fn(),
  isVerifying: false,
  verificationResult: null,
};

describe("WorkspaceStep", () => {
  afterEach(() => cleanup());

  it("renders Workspace Directory heading", () => {
    render(<WorkspaceStep {...defaultProps} />);
    expect(screen.getByText("Workspace Directory")).toBeInTheDocument();
  });

  it("renders Directory Path label", () => {
    render(<WorkspaceStep {...defaultProps} />);
    expect(screen.getByText("Directory Path")).toBeInTheDocument();
  });

  it("disables continue when path is empty", () => {
    render(<WorkspaceStep {...defaultProps} />);
    expect(screen.getByText("Continue")).toBeDisabled();
  });

  it("enables continue when path is provided", () => {
    render(<WorkspaceStep {...defaultProps} path="/tmp/work" />);
    expect(screen.getByText("Continue")).not.toBeDisabled();
  });

  it("disables continue when verifying", () => {
    render(<WorkspaceStep {...defaultProps} path="/tmp/work" isVerifying />);
    const btn = screen.getByText("Verifying");
    expect(btn.closest("button")).toBeDisabled();
  });

  it("calls onPathChange when input changes", () => {
    const onPathChange = vi.fn();
    render(<WorkspaceStep {...defaultProps} onPathChange={onPathChange} />);
    fireEvent.change(screen.getByTestId("path-input"), { target: { value: "/new/path" } });
    expect(onPathChange).toHaveBeenCalledWith("/new/path");
  });

  it("calls onBack when back button clicked", () => {
    const onBack = vi.fn();
    render(<WorkspaceStep {...defaultProps} onBack={onBack} />);
    fireEvent.click(screen.getByText("Back"));
    expect(onBack).toHaveBeenCalled();
  });

  it("shows error when verification fails", () => {
    render(
      <WorkspaceStep
        {...defaultProps}
        path="/bad/path"
        verificationResult={{ success: false, error: "Path not found" }}
      />,
    );
    expect(screen.getByText("Path not found")).toBeInTheDocument();
  });

  it("shows error when path not writable and cannot create", () => {
    render(
      <WorkspaceStep
        {...defaultProps}
        path="/read/only"
        verificationResult={{
          success: true,
          data: { path: "/read/only", exists: true, writable: false, canCreate: false },
        }}
      />,
    );
    expect(screen.getByText("Directory is not writable and cannot be created")).toBeInTheDocument();
  });

  it("does not show error when verification succeeds with writable path", () => {
    render(
      <WorkspaceStep
        {...defaultProps}
        path="/good/path"
        verificationResult={{
          success: true,
          data: { path: "/good/path", exists: true, writable: true, canCreate: true },
        }}
      />,
    );
    expect(screen.queryByText(/not writable/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Verification failed/)).not.toBeInTheDocument();
  });
});
