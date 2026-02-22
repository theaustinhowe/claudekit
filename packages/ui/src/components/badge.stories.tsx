import type { Meta, StoryObj } from "@storybook/react";
import { Badge } from "./badge";

const meta: Meta<typeof Badge> = {
  title: "Components/Badge",
  component: Badge,
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof Badge>;

interface PlaygroundArgs {
  variant: "default" | "secondary" | "destructive" | "outline";
  children: string;
}

export const Playground: StoryObj<PlaygroundArgs> = {
  argTypes: {
    variant: { control: "select", options: ["default", "secondary", "destructive", "outline"] },
    children: { control: "text" },
  },
  args: {
    variant: "default",
    children: "Badge",
  },
  render: (args) => <Badge variant={args.variant}>{args.children}</Badge>,
};

export const Default: Story = {
  args: { children: "Badge" },
};

export const Secondary: Story = {
  args: { variant: "secondary", children: "Secondary" },
};

export const Destructive: Story = {
  args: { variant: "destructive", children: "Destructive" },
};

export const Outline: Story = {
  args: { variant: "outline", children: "Outline" },
};
