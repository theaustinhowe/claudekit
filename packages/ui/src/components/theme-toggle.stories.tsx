import type { Meta, StoryObj } from "@storybook/react";
import { ThemeToggle } from "./theme-toggle";

// Mock next-themes ThemeProvider for Storybook
function ThemeDecorator(Story: React.ComponentType) {
  return (
    <div className="p-4">
      <Story />
    </div>
  );
}

const meta: Meta<typeof ThemeToggle> = {
  title: "Components/ThemeToggle",
  component: ThemeToggle,
  tags: ["autodocs"],
  decorators: [ThemeDecorator],
};
export default meta;

type Story = StoryObj<typeof ThemeToggle>;

export const Default: Story = {
  args: {},
};

export const WithLabel: Story = {
  args: { showLabel: true },
};
