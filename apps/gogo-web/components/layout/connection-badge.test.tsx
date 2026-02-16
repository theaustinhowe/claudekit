import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockWebSocketContext = vi.fn();
const mockUseHealth = vi.fn();

vi.mock("@/contexts/websocket-context", () => ({
  useWebSocketContext: () => mockWebSocketContext(),
}));

vi.mock("@/hooks/use-jobs", () => ({
  useHealth: () => mockUseHealth(),
}));

vi.mock("@devkit/ui", () => ({
  cn: (...args: string[]) => args.filter(Boolean).join(" "),
}));

vi.mock("@devkit/ui/components/badge", () => ({
  Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

vi.mock("@devkit/ui/components/popover", () => ({
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

import { ConnectionBadge } from "@/components/layout/connection-badge";

describe("ConnectionBadge", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    mockWebSocketContext.mockReturnValue({ connectionState: "connected" });
    mockUseHealth.mockReturnValue({
      data: {
        database: { connected: true },
        polling: { active: true },
        github: { rateLimitCritical: false },
      },
    });
  });

  it("shows Live when connected", () => {
    render(<ConnectionBadge />);
    expect(screen.getByText("Live")).toBeInTheDocument();
  });

  it("shows all systems operational when healthy", () => {
    render(<ConnectionBadge />);
    expect(screen.getByText("All systems operational")).toBeInTheDocument();
  });

  it("shows Offline when disconnected", () => {
    mockWebSocketContext.mockReturnValue({ connectionState: "disconnected" });
    render(<ConnectionBadge />);
    expect(screen.getByText("Offline")).toBeInTheDocument();
  });

  it("shows Reconnecting state", () => {
    mockWebSocketContext.mockReturnValue({ connectionState: "reconnecting" });
    render(<ConnectionBadge />);
    expect(screen.getByText("Reconnecting")).toBeInTheDocument();
  });

  it("shows database disconnected status", () => {
    mockUseHealth.mockReturnValue({
      data: {
        database: { connected: false },
        polling: { active: true },
        github: { rateLimitCritical: false },
      },
    });
    render(<ConnectionBadge />);
    expect(screen.getByText("Database disconnected")).toBeInTheDocument();
  });

  it("shows health dashboard link", () => {
    render(<ConnectionBadge />);
    expect(screen.getByText("Health dashboard")).toBeInTheDocument();
  });
});
