import type { Meta, StoryObj } from "@storybook/react";
import { AppShell } from "./app-shell";

const meta: Meta<typeof AppShell> = {
  title: "Components/AppShell",
  component: AppShell,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div style={{ height: "100vh" }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof AppShell>;

export const Default: Story = {
  render: () => (
    <AppShell
      sidebar={
        <div className="w-60 bg-muted/30 border-r p-4 text-sm text-muted-foreground flex items-center justify-center">
          Sidebar
        </div>
      }
      header={
        <div className="h-14 border-b bg-muted/20 flex items-center px-4 text-sm text-muted-foreground">Header</div>
      }
      footer={
        <div className="h-10 border-t bg-muted/20 flex items-center px-4 text-sm text-muted-foreground">Footer</div>
      }
    >
      <div className="flex-1 flex items-center justify-center text-muted-foreground">Main Content</div>
    </AppShell>
  ),
};

export const WithoutSidebar: Story = {
  render: () => (
    <AppShell
      header={
        <div className="h-14 border-b bg-muted/20 flex items-center px-4 text-sm text-muted-foreground">Header</div>
      }
      footer={
        <div className="h-10 border-t bg-muted/20 flex items-center px-4 text-sm text-muted-foreground">Footer</div>
      }
    >
      <div className="flex-1 flex items-center justify-center text-muted-foreground">Main Content</div>
    </AppShell>
  ),
};

export const ContentOnly: Story = {
  render: () => (
    <AppShell>
      <div className="flex-1 flex items-center justify-center text-muted-foreground">Content Only</div>
    </AppShell>
  ),
};
