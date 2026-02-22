import type { Meta, StoryObj } from "@storybook/react";
import { SessionIndicator } from "./session-indicator";
import type { SessionPanelContextValue } from "./session-provider";
import { SessionPanelContext } from "./session-provider";

// ---------------------------------------------------------------------------
// Mock decorator
// ---------------------------------------------------------------------------

function mockContext(overrides: Partial<SessionPanelContextValue> = {}): SessionPanelContextValue {
  return {
    sessions: [],
    activeCount: 0,
    panelOpen: false,
    setPanelOpen: () => {},
    config: { typeLabels: {} },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

interface PlaygroundArgs {
  activeCount: number;
}

const meta: Meta<typeof SessionIndicator> = {
  title: "Components/SessionIndicator",
  component: SessionIndicator,
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof SessionIndicator>;

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

export const Playground: StoryObj<PlaygroundArgs> = {
  argTypes: {
    activeCount: { control: { type: "number", min: 0 } },
  },
  args: {
    activeCount: 2,
  },
  render: (args) => (
    <SessionPanelContext.Provider value={mockContext({ activeCount: args.activeCount })}>
      <SessionIndicator />
    </SessionPanelContext.Provider>
  ),
};

export const NoActive: Story = {
  render: () => (
    <SessionPanelContext.Provider value={mockContext({ activeCount: 0 })}>
      <SessionIndicator />
    </SessionPanelContext.Provider>
  ),
};

export const OneActive: Story = {
  render: () => (
    <SessionPanelContext.Provider value={mockContext({ activeCount: 1 })}>
      <SessionIndicator />
    </SessionPanelContext.Provider>
  ),
};

export const MultipleActive: Story = {
  render: () => (
    <SessionPanelContext.Provider value={mockContext({ activeCount: 5 })}>
      <SessionIndicator />
    </SessionPanelContext.Provider>
  ),
};
