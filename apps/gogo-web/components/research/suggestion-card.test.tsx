import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@claudekit/ui/components/badge", () => ({
  Badge: ({ children, className }: { children: ReactNode; className?: string }) => (
    <span className={className}>{children}</span>
  ),
}));

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
  CardHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: ReactNode }) => <h3>{children}</h3>,
}));

vi.mock("lucide-react", () => ({
  AlertTriangle: () => <span data-testid="alert-icon" />,
  ArrowRight: () => <span />,
  FileCode: () => <span />,
  Info: () => <span data-testid="info-icon" />,
  ShieldAlert: () => <span data-testid="shield-icon" />,
  Zap: () => <span data-testid="zap-icon" />,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const mockConvert = vi.fn();

vi.mock("@/hooks/use-research", () => ({
  useConvertSuggestion: () => ({
    mutate: mockConvert,
    isPending: false,
  }),
}));

import { SuggestionCard } from "@/components/research/suggestion-card";
import type { ResearchSuggestionInfo } from "@/lib/api";

function makeSuggestion(overrides: Partial<ResearchSuggestionInfo> = {}): ResearchSuggestionInfo {
  return {
    id: "sug-1",
    sessionId: "session-1",
    category: "security",
    severity: "high",
    title: "Fix SQL injection",
    description: "Sanitize user input in query builder",
    filePaths: ["src/db.ts"],
    convertedTo: null,
    convertedId: null,
    createdAt: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("SuggestionCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => cleanup());

  it("renders suggestion title", () => {
    render(<SuggestionCard suggestion={makeSuggestion()} sessionId="session-1" />);
    expect(screen.getByText("Fix SQL injection")).toBeInTheDocument();
  });

  it("renders description", () => {
    render(<SuggestionCard suggestion={makeSuggestion()} sessionId="session-1" />);
    expect(screen.getByText("Sanitize user input in query builder")).toBeInTheDocument();
  });

  it("renders severity badge", () => {
    render(<SuggestionCard suggestion={makeSuggestion()} sessionId="session-1" />);
    expect(screen.getByText("high")).toBeInTheDocument();
  });

  it("renders category badge with mapped label", () => {
    render(<SuggestionCard suggestion={makeSuggestion({ category: "security" })} sessionId="session-1" />);
    expect(screen.getByText("Security")).toBeInTheDocument();
  });

  it("renders raw category when no mapping exists", () => {
    render(<SuggestionCard suggestion={makeSuggestion({ category: "custom" })} sessionId="session-1" />);
    expect(screen.getByText("custom")).toBeInTheDocument();
  });

  it("renders file paths", () => {
    render(<SuggestionCard suggestion={makeSuggestion()} sessionId="session-1" />);
    expect(screen.getByText("src/db.ts")).toBeInTheDocument();
  });

  it("does not render file paths when empty", () => {
    render(<SuggestionCard suggestion={makeSuggestion({ filePaths: [] })} sessionId="session-1" />);
    expect(screen.queryByText("src/db.ts")).not.toBeInTheDocument();
  });

  it("renders Create Job button when not converted", () => {
    render(<SuggestionCard suggestion={makeSuggestion()} sessionId="session-1" />);
    expect(screen.getByText("Create Job")).toBeInTheDocument();
  });

  it("hides action buttons when already converted", () => {
    render(
      <SuggestionCard
        suggestion={makeSuggestion({ convertedTo: "manual_job", convertedId: "job-1" })}
        sessionId="session-1"
      />,
    );
    expect(screen.queryByText("Create Job")).not.toBeInTheDocument();
    expect(screen.getByText("Converted")).toBeInTheDocument();
  });

  it("calls convert with manual_job when Create Job clicked", () => {
    render(<SuggestionCard suggestion={makeSuggestion()} sessionId="session-1" />);
    fireEvent.click(screen.getByText("Create Job"));
    expect(mockConvert).toHaveBeenCalledWith(
      { sessionId: "session-1", suggestionId: "sug-1", convertTo: "manual_job" },
      expect.any(Object),
    );
  });

  it("renders medium severity as fallback for unknown severity", () => {
    render(<SuggestionCard suggestion={makeSuggestion({ severity: "unknown" })} sessionId="session-1" />);
    // Should not crash - uses medium config as fallback
    expect(screen.getByText("unknown")).toBeInTheDocument();
  });
});
