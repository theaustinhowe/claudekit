import type { Meta, StoryObj } from "@storybook/react";
import { Badge } from "./badge";
import { SessionTerminal } from "./session-terminal";

const meta: Meta<typeof SessionTerminal> = {
  title: "Components/SessionTerminal",
  component: SessionTerminal,
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["terminal", "compact", "card"],
    },
    status: {
      control: "select",
      options: ["idle", "connecting", "streaming", "done", "error", "cancelled", "reconnecting"],
    },
  },
};
export default meta;

type Story = StoryObj<typeof SessionTerminal>;

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

const sampleLogs = [
  { log: "Initializing session...", logType: "status" },
  { log: "Reading repository structure", logType: "tool" },
  { log: "Analyzing codebase patterns", logType: "thinking" },
  { log: "Found 12 source files to process", logType: "status" },
  { log: "Phase 1: Analysis", logType: "phase-separator" },
  { log: "Scanning src/components/button.tsx", logType: "tool" },
  { log: "Scanning src/components/input.tsx", logType: "tool" },
  { log: "Considering accessibility improvements", logType: "thinking" },
  { log: "Generated 3 suggestions for button.tsx", logType: "status" },
];

const longLogs = Array.from({ length: 80 }, (_, i) => ({
  log: `[${String(i + 1).padStart(3, "0")}] Processing file ${i + 1} of 80 — src/components/generated-${i + 1}.tsx`,
  logType: i % 5 === 0 ? "tool" : i % 7 === 0 ? "thinking" : "status",
}));

const completionData = {
  prUrl: "https://github.com/example/repo/pull/42",
  branchName: "fix/improve-button-a11y",
  diffSummary: {
    filesChanged: 3,
    insertions: 45,
    deletions: 12,
  },
};

// ---------------------------------------------------------------------------
// Terminal variant stories
// ---------------------------------------------------------------------------

export const TerminalStreaming: Story = {
  args: {
    variant: "terminal",
    status: "streaming",
    logs: sampleLogs,
    progress: 65,
    phase: "Analyzing codebase",
    error: null,
    elapsed: 34,
    title: "Code Analysis",
    onCancel: () => {},
  },
  render: (args) => (
    <div style={{ height: 400 }}>
      <SessionTerminal {...args} />
    </div>
  ),
};

export const TerminalDone: Story = {
  args: {
    variant: "terminal",
    status: "done",
    logs: sampleLogs,
    progress: 100,
    phase: null,
    error: null,
    elapsed: 87,
    title: "Code Analysis",
    completionData,
    onDismiss: () => {},
  },
  render: (args) => (
    <div style={{ height: 400 }}>
      <SessionTerminal {...args} />
    </div>
  ),
};

export const TerminalError: Story = {
  args: {
    variant: "terminal",
    status: "error",
    logs: [...sampleLogs.slice(0, 4), { log: "[stderr] Error: Connection refused to remote API", logType: "status" }],
    progress: 30,
    phase: null,
    error: "Connection refused: unable to reach the remote API after 3 retries",
    elapsed: 15,
    title: "Code Analysis",
    onRetry: () => {},
    onDismiss: () => {},
  },
  render: (args) => (
    <div style={{ height: 400 }}>
      <SessionTerminal {...args} />
    </div>
  ),
};

// ---------------------------------------------------------------------------
// Compact variant stories
// ---------------------------------------------------------------------------

export const CompactStreaming: Story = {
  args: {
    variant: "compact",
    status: "streaming",
    logs: sampleLogs,
    progress: 42,
    phase: "Scanning files",
    error: null,
    elapsed: 21,
    title: "Quick Improve",
    onCancel: () => {},
    onToggleMinimize: () => {},
    minimized: false,
  },
  render: (args) => (
    <div style={{ maxWidth: 600 }}>
      <SessionTerminal {...args} />
    </div>
  ),
};

export const CompactDone: Story = {
  args: {
    variant: "compact",
    status: "done",
    logs: sampleLogs,
    progress: 100,
    phase: null,
    error: null,
    elapsed: 52,
    title: "Quick Improve",
    completionData,
    onDismiss: () => {},
    onToggleMinimize: () => {},
    minimized: false,
  },
  render: (args) => (
    <div style={{ maxWidth: 600 }}>
      <SessionTerminal {...args} />
    </div>
  ),
};

export const CompactError: Story = {
  args: {
    variant: "compact",
    status: "error",
    logs: sampleLogs.slice(0, 3),
    progress: 20,
    phase: null,
    error: "Claude CLI process exited with code 1",
    elapsed: 8,
    title: "Finding Fix",
    onRetry: () => {},
    onDismiss: () => {},
    onToggleMinimize: () => {},
    minimized: false,
  },
  render: (args) => (
    <div style={{ maxWidth: 600 }}>
      <SessionTerminal {...args} />
    </div>
  ),
};

// ---------------------------------------------------------------------------
// Card variant stories
// ---------------------------------------------------------------------------

export const CardStreaming: Story = {
  args: {
    variant: "card",
    status: "streaming",
    logs: sampleLogs,
    progress: 55,
    phase: "Processing files",
    error: null,
    elapsed: 18,
    title: "Walkthrough Generation",
    onCancel: () => {},
    onToggleMinimize: () => {},
    minimized: false,
  },
  render: (args) => (
    <div style={{ maxWidth: 500 }}>
      <SessionTerminal {...args} />
    </div>
  ),
};

export const CardDone: Story = {
  args: {
    variant: "card",
    status: "done",
    logs: sampleLogs,
    progress: 100,
    phase: null,
    error: null,
    elapsed: 45,
    title: "Walkthrough Generation",
    onToggleMinimize: () => {},
    minimized: false,
  },
  render: (args) => (
    <div style={{ maxWidth: 500 }}>
      <SessionTerminal {...args} />
    </div>
  ),
};

export const CardError: Story = {
  args: {
    variant: "card",
    status: "error",
    logs: sampleLogs.slice(0, 2),
    progress: null,
    phase: null,
    error: "Session timed out after 120 seconds",
    elapsed: 120,
    title: "Walkthrough Generation",
    onRetry: () => {},
    onToggleMinimize: () => {},
    minimized: false,
  },
  render: (args) => (
    <div style={{ maxWidth: 500 }}>
      <SessionTerminal {...args} />
    </div>
  ),
};

export const CardMinimized: Story = {
  args: {
    variant: "card",
    status: "streaming",
    logs: sampleLogs,
    progress: 70,
    phase: "Almost done",
    error: null,
    elapsed: 33,
    title: "Walkthrough Generation",
    onCancel: () => {},
    onToggleMinimize: () => {},
    minimized: true,
  },
  render: (args) => (
    <div style={{ maxWidth: 500 }}>
      <SessionTerminal {...args} />
    </div>
  ),
};

// ---------------------------------------------------------------------------
// State stories
// ---------------------------------------------------------------------------

export const Idle: Story = {
  args: {
    variant: "compact",
    status: "idle",
    logs: [],
    progress: null,
    phase: null,
    error: null,
    elapsed: 0,
    title: "Pending Session",
  },
  render: (args) => (
    <div style={{ maxWidth: 600 }}>
      <SessionTerminal {...args} />
    </div>
  ),
};

export const LongOutput: Story = {
  args: {
    variant: "compact",
    status: "streaming",
    logs: longLogs,
    progress: 85,
    phase: "Processing batch",
    error: null,
    elapsed: 96,
    title: "Batch Processing",
    onCancel: () => {},
    onToggleMinimize: () => {},
    minimized: false,
  },
  render: (args) => (
    <div style={{ maxWidth: 600 }}>
      <SessionTerminal {...args} />
    </div>
  ),
};

export const WithHeaderExtra: Story = {
  args: {
    variant: "compact",
    status: "streaming",
    logs: sampleLogs,
    progress: 50,
    phase: "Running",
    error: null,
    elapsed: 25,
    title: "Session with Extra",
    onCancel: () => {},
    headerExtra: <Badge variant="secondary">v2.1</Badge>,
  },
  render: (args) => (
    <div style={{ maxWidth: 600 }}>
      <SessionTerminal {...args} />
    </div>
  ),
};

export const CardWithHeaderExtra: Story = {
  args: {
    variant: "card",
    status: "streaming",
    logs: sampleLogs,
    progress: 50,
    phase: "Running",
    error: null,
    elapsed: 25,
    title: "Session with Extra",
    onCancel: () => {},
    onToggleMinimize: () => {},
    minimized: false,
    headerExtra: (
      <span className="text-xs text-muted-foreground" style={{ marginLeft: 4 }}>
        Step 3/7
      </span>
    ),
  },
  render: (args) => (
    <div style={{ maxWidth: 500 }}>
      <SessionTerminal {...args} />
    </div>
  ),
};
