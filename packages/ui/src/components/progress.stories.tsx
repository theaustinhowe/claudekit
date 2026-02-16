import type { Meta, StoryObj } from "@storybook/react";
import { Progress } from "./progress";

const meta: Meta<typeof Progress> = {
  title: "Components/Progress",
  component: Progress,
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof Progress>;

export const Default: Story = {
  args: { value: 60 },
  render: (args) => <Progress {...args} className="w-[300px]" />,
};

export const Empty: Story = {
  args: { value: 0 },
  render: (args) => <Progress {...args} className="w-[300px]" />,
};

export const Full: Story = {
  args: { value: 100 },
  render: (args) => <Progress {...args} className="w-[300px]" />,
};

export const HalfFull: Story = {
  args: { value: 50 },
  render: (args) => <Progress {...args} className="w-[300px]" />,
};

export const WithLabel: Story = {
  args: { value: 65 },
  render: (args) => (
    <div className="w-[300px] space-y-2">
      <div className="flex justify-between text-sm">
        <span>Uploading...</span>
        <span>{args.value}%</span>
      </div>
      <Progress {...args} />
    </div>
  ),
};
