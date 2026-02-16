import type { Meta, StoryObj } from "@storybook/react";
import { Slider } from "./slider";

const meta: Meta<typeof Slider> = {
  title: "Components/Slider",
  component: Slider,
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof Slider>;

export const Default: Story = {
  args: { defaultValue: [50], max: 100, step: 1 },
  render: (args) => <Slider {...args} className="w-[300px]" />,
};

export const Range: Story = {
  args: { defaultValue: [25, 75], max: 100, step: 1 },
  render: (args) => <Slider {...args} className="w-[300px]" />,
};

export const SmallStep: Story = {
  args: { defaultValue: [50], max: 100, step: 10 },
  render: (args) => <Slider {...args} className="w-[300px]" />,
};

export const Disabled: Story = {
  args: { defaultValue: [50], max: 100, step: 1, disabled: true },
  render: (args) => <Slider {...args} className="w-[300px]" />,
};
