import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@devkit/ui/components/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    ...props
  }: {
    children: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button onClick={onClick} disabled={disabled} {...props}>
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

vi.mock("@devkit/ui/components/dialog", () => ({
  Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogBody: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h3>{children}</h3>,
  DialogTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@devkit/ui/components/input", () => ({
  Input: ({ value, onChange, type, ...props }: { value?: string; onChange?: (e: unknown) => void; type?: string }) => (
    <input value={value} onChange={onChange} type={type} data-testid="token-input" {...props} />
  ),
}));

vi.mock("@devkit/ui/components/label", () => ({
  Label: ({ children }: { children: ReactNode }) => <label>{children}</label>,
}));

vi.mock("lucide-react", () => ({
  CheckCircle2: () => <span />,
  ExternalLink: () => <span />,
  Eye: () => <span data-testid="eye-icon" />,
  EyeOff: () => <span data-testid="eye-off-icon" />,
  Github: () => <span />,
  HelpCircle: () => <span />,
  Loader2: () => <span />,
  XCircle: () => <span />,
}));

import { GitHubStep } from "@/components/setup/github-step";

describe("GitHubStep", () => {
  afterEach(() => cleanup());

  const defaultProps = {
    token: "",
    onTokenChange: vi.fn(),
    onContinue: vi.fn(),
    isVerifying: false,
    verificationResult: null,
  };

  it("renders Connect to GitHub heading", () => {
    render(<GitHubStep {...defaultProps} />);
    expect(screen.getByText("Connect to GitHub")).toBeInTheDocument();
  });

  it("renders Personal Access Token label", () => {
    render(<GitHubStep {...defaultProps} />);
    expect(screen.getByText("Personal Access Token")).toBeInTheDocument();
  });

  it("disables continue when token is empty", () => {
    render(<GitHubStep {...defaultProps} />);
    const btn = screen.getByText("Continue");
    expect(btn).toBeDisabled();
  });

  it("enables continue when token is provided", () => {
    render(<GitHubStep {...defaultProps} token="ghp_test123" />);
    const btn = screen.getByText("Continue");
    expect(btn).not.toBeDisabled();
  });

  it("disables continue when verifying", () => {
    render(<GitHubStep {...defaultProps} token="ghp_test123" isVerifying />);
    const btn = screen.getByText("Verifying");
    expect(btn.closest("button")).toBeDisabled();
  });

  it("shows Verifying text when isVerifying", () => {
    render(<GitHubStep {...defaultProps} token="ghp_test123" isVerifying />);
    expect(screen.getByText("Verifying")).toBeInTheDocument();
  });

  it("shows error when verification failed", () => {
    render(
      <GitHubStep {...defaultProps} token="ghp_bad" verificationResult={{ success: false, error: "Invalid token" }} />,
    );
    expect(screen.getByText("Invalid token")).toBeInTheDocument();
  });

  it("shows default error message when no error text", () => {
    render(<GitHubStep {...defaultProps} token="ghp_bad" verificationResult={{ success: false }} />);
    expect(screen.getByText("Verification failed")).toBeInTheDocument();
  });

  it("calls onTokenChange when input changes", () => {
    const onTokenChange = vi.fn();
    render(<GitHubStep {...defaultProps} onTokenChange={onTokenChange} />);
    fireEvent.change(screen.getByTestId("token-input"), { target: { value: "ghp_new" } });
    expect(onTokenChange).toHaveBeenCalledWith("ghp_new");
  });

  it("calls onContinue when continue button is clicked", () => {
    const onContinue = vi.fn();
    render(<GitHubStep {...defaultProps} token="ghp_test" onContinue={onContinue} />);
    fireEvent.click(screen.getByText("Continue"));
    expect(onContinue).toHaveBeenCalled();
  });
});
