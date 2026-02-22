import type { Meta, StoryObj } from "@storybook/react";
import type { StreamEntry } from "./streaming-display";
import { StreamingDisplay } from "./streaming-display";

const meta: Meta<typeof StreamingDisplay> = {
  title: "Components/StreamingDisplay",
  component: StreamingDisplay,
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof StreamingDisplay>;

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

const terminalMixedEntries: StreamEntry[] = [
  { id: 1, kind: "status", statusText: "Connected", rawText: "Connected" },
  {
    id: 2,
    kind: "read-op",
    toolName: "Read",
    filePath: "src/lib/utils.ts",
    rawText: "Read  src/lib/utils.ts",
  },
  {
    id: 3,
    kind: "thinking",
    thinkingText: "Analyzing the existing utility functions to understand the codebase patterns.",
    rawText: "\tAnalyzing the existing utility functions to understand the codebase patterns.",
  },
  {
    id: 4,
    kind: "file-write",
    toolName: "Write",
    filePath: "src/components/button.tsx",
    rawText: "Write  src/components/button.tsx",
  },
  {
    id: 5,
    kind: "file-edit",
    toolName: "Edit",
    filePath: "src/components/card.tsx",
    rawText: "Edit  src/components/card.tsx",
  },
  {
    id: 6,
    kind: "bash-command",
    toolName: "Bash",
    command: "pnpm typecheck",
    rawText: "Bash  pnpm typecheck",
  },
  {
    id: 7,
    kind: "thinking",
    thinkingText: "The typecheck passed. Let me also run the tests to make sure nothing is broken.",
    rawText: "\tThe typecheck passed. Let me also run the tests to make sure nothing is broken.",
  },
  {
    id: 8,
    kind: "bash-command",
    toolName: "Bash",
    command: "pnpm test -- --run",
    rawText: "Bash  pnpm test -- --run",
  },
  {
    id: 9,
    kind: "status",
    statusText: "Done in 12.3s",
    rawText: "Done in 12.3s",
  },
];

const chatLiveEntries: StreamEntry[] = [
  { id: 1, kind: "status", statusText: "Connected", rawText: "Connected" },
  {
    id: 2,
    kind: "read-op",
    toolName: "Glob",
    filePath: "src/**/*.tsx",
    rawText: "Glob  src/**/*.tsx",
  },
  {
    id: 3,
    kind: "read-op",
    toolName: "Read",
    filePath: "src/app/layout.tsx",
    rawText: "Read  src/app/layout.tsx",
  },
  {
    id: 4,
    kind: "thinking",
    thinkingText: "The layout uses a sidebar component. I should update the navigation links.",
    rawText: "\tThe layout uses a sidebar component. I should update the navigation links.",
  },
  {
    id: 5,
    kind: "file-edit",
    toolName: "Edit",
    filePath: "src/components/layout/sidebar.tsx",
    rawText: "Edit  src/components/layout/sidebar.tsx",
  },
  {
    id: 6,
    kind: "file-write",
    toolName: "Write",
    filePath: "src/app/dashboard/page.tsx",
    rawText: "Write  src/app/dashboard/page.tsx",
  },
  {
    id: 7,
    kind: "file-write",
    toolName: "Write",
    filePath: "src/app/dashboard/dashboard-client.tsx",
    rawText: "Write  src/app/dashboard/dashboard-client.tsx",
  },
  {
    id: 8,
    kind: "bash-command",
    toolName: "Bash",
    command: "pnpm lint:fix",
    rawText: "Bash  pnpm lint:fix",
  },
];

const chatCollapsedEntries: StreamEntry[] = [
  { id: 1, kind: "status", statusText: "Connected", rawText: "Connected" },
  {
    id: 2,
    kind: "read-op",
    toolName: "Read",
    filePath: "package.json",
    rawText: "Read  package.json",
  },
  {
    id: 3,
    kind: "file-write",
    toolName: "Write",
    filePath: "src/lib/api-client.ts",
    rawText: "Write  src/lib/api-client.ts",
  },
  {
    id: 4,
    kind: "file-write",
    toolName: "Write",
    filePath: "src/lib/types.ts",
    rawText: "Write  src/lib/types.ts",
  },
  {
    id: 5,
    kind: "file-edit",
    toolName: "Edit",
    filePath: "src/app/page.tsx",
    rawText: "Edit  src/app/page.tsx",
  },
  {
    id: 6,
    kind: "bash-command",
    toolName: "Bash",
    command: "pnpm build",
    rawText: "Bash  pnpm build",
  },
  {
    id: 7,
    kind: "status",
    statusText: "Done in 8.1s",
    rawText: "Done in 8.1s",
  },
];

const fileGroupEntries: StreamEntry[] = [
  { id: 1, kind: "status", statusText: "Connected", rawText: "Connected" },
  {
    id: 2,
    kind: "file-write",
    toolName: "Write",
    filePath: "src/components/ui/button.tsx",
    rawText: "Write  src/components/ui/button.tsx",
  },
  {
    id: 3,
    kind: "file-write",
    toolName: "Write",
    filePath: "src/components/ui/input.tsx",
    rawText: "Write  src/components/ui/input.tsx",
  },
  {
    id: 4,
    kind: "file-edit",
    toolName: "Edit",
    filePath: "src/components/ui/dialog.tsx",
    rawText: "Edit  src/components/ui/dialog.tsx",
  },
  {
    id: 5,
    kind: "file-write",
    toolName: "Write",
    filePath: "src/components/ui/select.tsx",
    rawText: "Write  src/components/ui/select.tsx",
  },
  {
    id: 6,
    kind: "thinking",
    thinkingText: "Now I need to update the barrel export in the layout directory.",
    rawText: "\tNow I need to update the barrel export in the layout directory.",
  },
  {
    id: 7,
    kind: "file-write",
    toolName: "Write",
    filePath: "src/components/layout/header.tsx",
    rawText: "Write  src/components/layout/header.tsx",
  },
  {
    id: 8,
    kind: "file-edit",
    toolName: "Edit",
    filePath: "src/components/layout/sidebar.tsx",
    rawText: "Edit  src/components/layout/sidebar.tsx",
  },
  {
    id: 9,
    kind: "file-write",
    toolName: "Write",
    filePath: "src/components/layout/footer.tsx",
    rawText: "Write  src/components/layout/footer.tsx",
  },
  {
    id: 10,
    kind: "status",
    statusText: "Done in 5.2s",
    rawText: "Done in 5.2s",
  },
];

const thinkingGroupEntries: StreamEntry[] = [
  { id: 1, kind: "status", statusText: "Connected", rawText: "Connected" },
  {
    id: 2,
    kind: "read-op",
    toolName: "Read",
    filePath: "src/lib/db/schema.ts",
    rawText: "Read  src/lib/db/schema.ts",
  },
  {
    id: 3,
    kind: "thinking",
    thinkingText: "Let me analyze the database schema to understand the current table structure.",
    rawText: "\tLet me analyze the database schema to understand the current table structure.",
  },
  {
    id: 4,
    kind: "thinking",
    thinkingText: "The sessions table uses VARCHAR for timestamps and BOOLEAN for flags.",
    rawText: "\tThe sessions table uses VARCHAR for timestamps and BOOLEAN for flags.",
  },
  {
    id: 5,
    kind: "thinking",
    thinkingText: "I need to add a new migration that adds the priority column to the sessions table.",
    rawText: "\tI need to add a new migration that adds the priority column to the sessions table.",
  },
  {
    id: 6,
    kind: "thinking",
    thinkingText: "The migration should also create an index on the new column for query performance.",
    rawText: "\tThe migration should also create an index on the new column for query performance.",
  },
  {
    id: 7,
    kind: "thinking",
    thinkingText: "Let me also check the existing migration numbering to use the correct sequence number.",
    rawText: "\tLet me also check the existing migration numbering to use the correct sequence number.",
  },
  {
    id: 8,
    kind: "file-write",
    toolName: "Write",
    filePath: "migrations/005_add_priority.sql",
    rawText: "Write  migrations/005_add_priority.sql",
  },
  {
    id: 9,
    kind: "bash-command",
    toolName: "Bash",
    command: "pnpm db:migrate",
    rawText: "Bash  pnpm db:migrate",
  },
  {
    id: 10,
    kind: "status",
    statusText: "Done in 3.4s",
    rawText: "Done in 3.4s",
  },
];

const readGroupEntries: StreamEntry[] = [
  { id: 1, kind: "status", statusText: "Connected", rawText: "Connected" },
  {
    id: 2,
    kind: "read-op",
    toolName: "Glob",
    filePath: "src/**/*.ts",
    rawText: "Glob  src/**/*.ts",
  },
  {
    id: 3,
    kind: "read-op",
    toolName: "Read",
    filePath: "src/lib/types.ts",
    rawText: "Read  src/lib/types.ts",
  },
  {
    id: 4,
    kind: "read-op",
    toolName: "Read",
    filePath: "src/lib/utils.ts",
    rawText: "Read  src/lib/utils.ts",
  },
  {
    id: 5,
    kind: "thinking",
    thinkingText: "I should also check the constants file for related configuration.",
    rawText: "\tI should also check the constants file for related configuration.",
  },
  {
    id: 6,
    kind: "read-op",
    toolName: "Read",
    filePath: "src/lib/constants.ts",
    rawText: "Read  src/lib/constants.ts",
  },
  {
    id: 7,
    kind: "read-op",
    toolName: "Grep",
    filePath: "SessionType",
    rawText: "Grep  SessionType",
  },
  {
    id: 8,
    kind: "read-op",
    toolName: "Read",
    filePath: "src/lib/services/session-manager.ts",
    rawText: "Read  src/lib/services/session-manager.ts",
  },
  {
    id: 9,
    kind: "file-edit",
    toolName: "Edit",
    filePath: "src/lib/types.ts",
    rawText: "Edit  src/lib/types.ts",
  },
  {
    id: 10,
    kind: "status",
    statusText: "Done in 6.7s",
    rawText: "Done in 6.7s",
  },
];

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

export const TerminalVariant: Story = {
  args: {
    entries: terminalMixedEntries,
    variant: "terminal",
  },
  render: (args) => (
    <div className="w-full max-w-lg rounded-md border bg-zinc-950 p-3">
      <StreamingDisplay {...args} />
    </div>
  ),
};

export const ChatVariantLive: Story = {
  args: {
    entries: chatLiveEntries,
    variant: "chat",
    live: true,
  },
  render: (args) => (
    <div className="w-full max-w-lg rounded-md border bg-background p-3">
      <StreamingDisplay {...args} />
    </div>
  ),
};

export const ChatVariantCollapsed: Story = {
  args: {
    entries: chatCollapsedEntries,
    variant: "chat",
    live: false,
  },
  render: (args) => (
    <div className="w-full max-w-lg rounded-md border bg-background p-3">
      <StreamingDisplay {...args} />
    </div>
  ),
};

export const FileGroup: Story = {
  args: {
    entries: fileGroupEntries,
    variant: "terminal",
  },
  render: (args) => (
    <div className="w-full max-w-lg rounded-md border bg-zinc-950 p-3">
      <StreamingDisplay {...args} />
    </div>
  ),
};

export const ThinkingGroup: Story = {
  args: {
    entries: thinkingGroupEntries,
    variant: "terminal",
  },
  render: (args) => (
    <div className="w-full max-w-lg rounded-md border bg-zinc-950 p-3">
      <StreamingDisplay {...args} />
    </div>
  ),
};

export const ReadGroup: Story = {
  args: {
    entries: readGroupEntries,
    variant: "terminal",
  },
  render: (args) => (
    <div className="w-full max-w-lg rounded-md border bg-zinc-950 p-3">
      <StreamingDisplay {...args} />
    </div>
  ),
};
