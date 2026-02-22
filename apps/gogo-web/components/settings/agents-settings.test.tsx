import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@claudekit/ui/components/badge", () => ({
  Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

vi.mock("@claudekit/ui/components/card", () => ({
  Card: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  CardHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: ReactNode }) => <h3>{children}</h3>,
}));

vi.mock("@claudekit/ui/components/collapsible", () => ({
  Collapsible: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CollapsibleContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CollapsibleTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@claudekit/ui/components/skeleton", () => ({
  Skeleton: ({ className }: { className?: string }) => <div data-testid="skeleton" className={className} />,
}));

vi.mock("lucide-react", () => ({
  AlertCircle: () => <span />,
  Bot: () => <span />,
  Check: () => <span />,
  ExternalLink: () => <span />,
  Info: () => <span />,
  X: () => <span />,
}));

vi.mock("@/hooks/use-agents", () => ({
  useAllAgents: vi.fn(),
}));

import { AgentsSettings } from "@/components/settings/agents-settings";
import { useAllAgents } from "@/hooks/use-agents";
import type { KnownAgentInfo } from "@/lib/api";

function makeAgent(overrides: Partial<KnownAgentInfo> = {}): KnownAgentInfo {
  return {
    type: "claude-code",
    displayName: "Claude Code",
    description: "AI coding agent",
    capabilities: { canResume: true, canInject: true, supportsStreaming: true },
    envVars: [],
    docsUrl: null,
    installInstructions: "Install via npm",
    registered: true,
    status: { available: true, configured: true, message: "Ready" },
    ...overrides,
  };
}

describe("AgentsSettings", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows loading skeletons when loading", () => {
    vi.mocked(useAllAgents).mockReturnValue({
      data: [],
      isLoading: true,
    } as never);

    render(<AgentsSettings />);
    expect(screen.getAllByTestId("skeleton")).toHaveLength(2);
  });

  it("shows no agents message when none configured", () => {
    vi.mocked(useAllAgents).mockReturnValue({
      data: [],
      isLoading: false,
    } as never);

    render(<AgentsSettings />);
    expect(screen.getByText(/No agents are configured yet/)).toBeInTheDocument();
  });

  it("renders configured agent with Ready badge", () => {
    vi.mocked(useAllAgents).mockReturnValue({
      data: [makeAgent()],
      isLoading: false,
    } as never);

    render(<AgentsSettings />);
    expect(screen.getByText("Claude Code")).toBeInTheDocument();
    expect(screen.getByText("Ready")).toBeInTheDocument();
  });

  it("shows capabilities badges for configured agents", () => {
    vi.mocked(useAllAgents).mockReturnValue({
      data: [makeAgent()],
      isLoading: false,
    } as never);

    render(<AgentsSettings />);
    expect(screen.getByText("Pause/Resume")).toBeInTheDocument();
    expect(screen.getByText("Message Injection")).toBeInTheDocument();
    expect(screen.getByText("Streaming Logs")).toBeInTheDocument();
  });

  it("renders unconfigured agent with Needs Config badge", () => {
    vi.mocked(useAllAgents).mockReturnValue({
      data: [
        makeAgent({
          type: "other-agent",
          displayName: "Other Agent",
          status: { available: false, configured: false, message: "Not configured", details: { cliInstalled: true } },
        }),
      ],
      isLoading: false,
    } as never);

    render(<AgentsSettings />);
    expect(screen.getByText("Other Agent")).toBeInTheDocument();
    expect(screen.getByText("Needs Config")).toBeInTheDocument();
  });

  it("renders unconfigured agent with Not Configured badge when no details are true", () => {
    vi.mocked(useAllAgents).mockReturnValue({
      data: [
        makeAgent({
          type: "other-agent",
          displayName: "Other Agent",
          status: {
            available: false,
            configured: false,
            message: "Not configured",
            details: { cliInstalled: false, apiKeySet: false },
          },
        }),
      ],
      isLoading: false,
    } as never);

    render(<AgentsSettings />);
    expect(screen.getByText("Not Configured")).toBeInTheDocument();
  });

  it("separates configured and available agents", () => {
    vi.mocked(useAllAgents).mockReturnValue({
      data: [
        makeAgent({ displayName: "Configured Agent" }),
        makeAgent({
          type: "unconfigured",
          displayName: "Available Agent",
          status: { available: false, configured: false, message: "Not ready" },
        }),
      ],
      isLoading: false,
    } as never);

    render(<AgentsSettings />);
    expect(screen.getByText("Configured Agent")).toBeInTheDocument();
    expect(screen.getByText("Available Agent")).toBeInTheDocument();
  });

  it("shows environment variables section for unconfigured agents", () => {
    vi.mocked(useAllAgents).mockReturnValue({
      data: [
        makeAgent({
          type: "other",
          displayName: "Other",
          status: { available: false, configured: false, message: "Not ready" },
          envVars: [{ name: "API_KEY", description: "Your API key", required: true }],
        }),
      ],
      isLoading: false,
    } as never);

    render(<AgentsSettings />);
    expect(screen.getByText("Environment Variables")).toBeInTheDocument();
    expect(screen.getByText("API_KEY")).toBeInTheDocument();
  });

  it("shows install instructions for unconfigured agents", () => {
    vi.mocked(useAllAgents).mockReturnValue({
      data: [
        makeAgent({
          type: "other",
          displayName: "Other",
          status: { available: false, configured: false, message: "Not ready" },
          installInstructions: "Run npm install other-agent",
        }),
      ],
      isLoading: false,
    } as never);

    render(<AgentsSettings />);
    expect(screen.getByText("Run npm install other-agent")).toBeInTheDocument();
  });

  it("renders Agent Providers heading", () => {
    vi.mocked(useAllAgents).mockReturnValue({
      data: [],
      isLoading: false,
    } as never);

    render(<AgentsSettings />);
    expect(screen.getByText("Agent Providers")).toBeInTheDocument();
  });
});
