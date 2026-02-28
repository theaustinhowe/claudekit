import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@claudekit/ui/components/button", () => ({
  Button: ({ children, onClick, disabled }: { children: ReactNode; onClick?: () => void; disabled?: boolean }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

vi.mock("@claudekit/ui/components/card", () => ({
  Card: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  CardHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: ReactNode }) => <h3>{children}</h3>,
}));

vi.mock("@claudekit/ui/components/input", () => ({
  Input: ({ value, onChange, ...props }: { value?: string; onChange?: (e: unknown) => void }) => (
    <input value={value} onChange={onChange} {...props} />
  ),
}));

vi.mock("@claudekit/ui/components/label", () => ({
  // biome-ignore lint/a11y/noLabelWithoutControl: test mock
  Label: ({ children, ...props }: { children: ReactNode }) => <label {...props}>{children}</label>,
}));

vi.mock("@claudekit/ui/components/slider", () => ({
  Slider: ({ value, onValueChange }: { value: number[]; onValueChange?: (val: number[]) => void }) => (
    <input
      type="range"
      value={value[0]}
      onChange={(e) => onValueChange?.([Number(e.target.value)])}
      data-testid="slider"
    />
  ),
}));

vi.mock("lucide-react", () => ({
  FolderOpen: () => <span />,
  Loader2: () => <span />,
  Settings: () => <span />,
  Info: () => <span />,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const mockMutate = vi.fn();

vi.mock("@/hooks/use-settings", () => ({
  useSettings: vi.fn(),
  useUpdateSettings: vi.fn(),
}));

import { GeneralSettings } from "@/components/settings/general-settings";
import { useSettings, useUpdateSettings } from "@/hooks/use-settings";

describe("GeneralSettings", () => {
  beforeEach(() => {
    vi.mocked(useSettings).mockReturnValue({
      data: { workDirectory: "/tmp/agent-worktrees", maxParallelJobs: 3 },
    } as never);
    vi.mocked(useUpdateSettings).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    } as unknown as ReturnType<typeof useUpdateSettings>);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders General Settings heading", () => {
    render(<GeneralSettings />);
    expect(screen.getByText("General Settings")).toBeInTheDocument();
  });

  it("renders work directory input", () => {
    render(<GeneralSettings />);
    expect(screen.getByDisplayValue("/tmp/agent-worktrees")).toBeInTheDocument();
  });

  it("renders max parallel jobs label", () => {
    render(<GeneralSettings />);
    expect(screen.getByText("Max Parallel Jobs")).toBeInTheDocument();
    expect(screen.getByText("3 jobs")).toBeInTheDocument();
  });

  it("disables save button when no changes", () => {
    render(<GeneralSettings />);
    const saveButton = screen.getByText("Save Settings");
    expect(saveButton).toBeDisabled();
  });

  it("enables save button when work directory changes", () => {
    render(<GeneralSettings />);
    const input = screen.getByDisplayValue("/tmp/agent-worktrees");
    fireEvent.change(input, { target: { value: "/new/path" } });
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
  });

  it("shows singular 'job' for maxParallelJobs = 1", () => {
    vi.mocked(useSettings).mockReturnValue({
      data: { workDirectory: "/tmp/agent-worktrees", maxParallelJobs: 1 },
    } as never);
    render(<GeneralSettings />);
    expect(screen.getByText("1 job")).toBeInTheDocument();
  });
});
