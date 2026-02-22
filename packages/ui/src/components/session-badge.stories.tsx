import type { SessionStatusBase } from "@claudekit/session";
import type { Meta, StoryObj } from "@storybook/react";
import { SessionBadge } from "./session-badge";

const meta: Meta<typeof SessionBadge> = {
  title: "Components/SessionBadge",
  component: SessionBadge,
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof SessionBadge>;

// ---------------------------------------------------------------------------
// Playground
// ---------------------------------------------------------------------------

interface PlaygroundArgs {
  status: SessionStatusBase;
  label: string;
  elapsed: number;
}

export const Playground: StoryObj<PlaygroundArgs> = {
  argTypes: {
    status: {
      control: "select",
      options: ["pending", "running", "done", "error", "cancelled"],
    },
    label: { control: "text" },
    elapsed: { control: "number" },
  },
  args: {
    status: "running",
    label: "",
    elapsed: 42,
  },
  render: (args) => (
    <SessionBadge status={args.status} label={args.label || undefined} elapsed={args.elapsed || undefined} />
  ),
};

// ---------------------------------------------------------------------------
// All statuses
// ---------------------------------------------------------------------------

const allStatuses: SessionStatusBase[] = ["pending", "running", "done", "error", "cancelled"];

export const AllStatuses: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      {allStatuses.map((status) => (
        <SessionBadge key={status} status={status} elapsed={status === "running" ? 34 : undefined} />
      ))}
    </div>
  ),
};
