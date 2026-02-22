import type { SessionRowBase } from "@claudekit/session";
import type { Meta, StoryObj } from "@storybook/react";
import { SessionPanel } from "./session-panel";
import type { SessionPanelContextValue } from "./session-provider";
import { SessionPanelContext } from "./session-provider";

// ---------------------------------------------------------------------------
// Mock data factory
// ---------------------------------------------------------------------------

let idCounter = 0;

function mockSession(overrides: Partial<SessionRowBase> = {}): SessionRowBase {
  idCounter += 1;
  return {
    id: `mock-session-${idCounter}`,
    session_type: "scan",
    status: "running",
    label: "Test session",
    progress: 0,
    phase: null,
    pid: null,
    started_at: new Date(Date.now() - 60_000).toISOString(),
    completed_at: null,
    created_at: new Date(Date.now() - 120_000).toISOString(),
    error_message: null,
    ...overrides,
  };
}

function mockContext(overrides: Partial<SessionPanelContextValue> = {}): SessionPanelContextValue {
  const sessions = overrides.sessions ?? [];
  const activeCount =
    overrides.activeCount ?? sessions.filter((s) => s.status === "running" || s.status === "pending").length;
  return {
    sessions,
    activeCount,
    panelOpen: true,
    setPanelOpen: () => {},
    config: { typeLabels: { scan: "Scan", chat: "Chat", improve: "Improve" } },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

const meta: Meta<typeof SessionPanel> = {
  title: "Components/SessionPanel",
  component: SessionPanel,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
  },
};
export default meta;

type Story = StoryObj<typeof SessionPanel>;

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

export const WithActiveSessions: Story = {
  render: () => {
    const sessions = [
      mockSession({ label: "Scanning repository structure", phase: "Analyzing files", progress: 45 }),
      mockSession({ label: "Running code review", session_type: "improve", phase: "Checking patterns", progress: 20 }),
    ];
    return (
      <SessionPanelContext.Provider value={mockContext({ sessions })}>
        <SessionPanel />
      </SessionPanelContext.Provider>
    );
  },
};

export const WithMixedSessions: Story = {
  render: () => {
    const sessions = [
      mockSession({ label: "Active scan in progress", phase: "Reading files", progress: 60 }),
      mockSession({
        label: "Completed code review",
        status: "done",
        session_type: "improve",
        progress: 100,
        completed_at: new Date(Date.now() - 300_000).toISOString(),
      }),
      mockSession({
        label: "Failed deployment check",
        status: "error",
        session_type: "chat",
        error_message: "Connection timed out after 30s",
        completed_at: new Date(Date.now() - 600_000).toISOString(),
      }),
    ];
    return (
      <SessionPanelContext.Provider value={mockContext({ sessions })}>
        <SessionPanel />
      </SessionPanelContext.Provider>
    );
  },
};

export const EmptyState: Story = {
  render: () => (
    <SessionPanelContext.Provider value={mockContext({ sessions: [] })}>
      <SessionPanel />
    </SessionPanelContext.Provider>
  ),
};

export const WithProgress: Story = {
  render: () => {
    const sessions = [
      mockSession({
        label: "Building project artifacts",
        phase: "Compiling TypeScript (step 3/5)",
        progress: 72,
      }),
    ];
    return (
      <SessionPanelContext.Provider value={mockContext({ sessions })}>
        <SessionPanel />
      </SessionPanelContext.Provider>
    );
  },
};

export const WithError: Story = {
  render: () => {
    const sessions = [
      mockSession({
        label: "Database migration",
        status: "error",
        session_type: "scan",
        error_message: "ECONNREFUSED: Could not connect to database at localhost:5432",
        completed_at: new Date(Date.now() - 30_000).toISOString(),
      }),
    ];
    return (
      <SessionPanelContext.Provider value={mockContext({ sessions })}>
        <SessionPanel />
      </SessionPanelContext.Provider>
    );
  },
};
