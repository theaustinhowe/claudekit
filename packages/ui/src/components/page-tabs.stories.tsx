import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { PageTabs } from "./page-tabs";

const meta: Meta<typeof PageTabs> = {
  title: "Components/PageTabs",
  component: PageTabs,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-full border rounded-lg overflow-hidden">
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof PageTabs>;

export const Default: Story = {
  render: () => {
    const [value, setValue] = useState("overview");
    return (
      <PageTabs
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "details", label: "Details" },
          { id: "settings", label: "Settings" },
        ]}
        value={value}
        onValueChange={setValue}
      />
    );
  },
};

export const WithCounts: Story = {
  render: () => {
    const [value, setValue] = useState("open");
    return (
      <PageTabs
        tabs={[
          { id: "open", label: "Open", count: 12 },
          { id: "in-progress", label: "In Progress", count: 3 },
          { id: "closed", label: "Closed", count: 47 },
        ]}
        value={value}
        onValueChange={setValue}
      />
    );
  },
};

export const WithActions: Story = {
  render: () => {
    const [value, setValue] = useState("policies");
    return (
      <PageTabs
        tabs={[
          { id: "policies", label: "Policies", count: 5 },
          { id: "rules", label: "Rules", count: 8 },
        ]}
        value={value}
        onValueChange={setValue}
        actions={
          <div className="flex gap-2">
            <button type="button" className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted">
              Import
            </button>
            <button
              type="button"
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              New Policy
            </button>
          </div>
        }
      />
    );
  },
};

export const ManyTabs: Story = {
  render: () => {
    const [value, setValue] = useState("all");
    return (
      <PageTabs
        tabs={[
          { id: "all", label: "All", count: 142 },
          { id: "skills", label: "Skills", count: 28 },
          { id: "hooks", label: "Hooks", count: 15 },
          { id: "commands", label: "Commands", count: 22 },
          { id: "agents", label: "Agents", count: 9 },
          { id: "mcp-servers", label: "MCP Servers", count: 41 },
          { id: "plugins", label: "Plugins", count: 17 },
          { id: "templates", label: "Templates", count: 6 },
          { id: "workflows", label: "Workflows", count: 4 },
        ]}
        value={value}
        onValueChange={setValue}
      />
    );
  },
};
