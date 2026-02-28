import type { Meta, StoryObj } from "@storybook/react";
import { ProcessCleanup } from "./process-cleanup";

const meta: Meta<typeof ProcessCleanup> = {
  title: "Components/ProcessCleanup",
  component: ProcessCleanup,
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof ProcessCleanup>;

export const Default: Story = {
  args: {
    label: "Session Cleanup",
    itemNoun: "session",
  },
};

export const CustomLabel: Story = {
  args: {
    label: "Dev Server Cleanup",
    itemNoun: "dev server",
    cleanupUrl: "/api/dev-servers/cleanup",
  },
};
