import type { Meta, StoryObj } from "@storybook/react";
import { Slider } from "./slider";

const meta: Meta<typeof Slider> = {
  title: "Components/Slider",
  component: Slider,
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof Slider>;

interface PlaygroundArgs {
  max: number;
  step: number;
  disabled: boolean;
}

export const Playground: StoryObj<PlaygroundArgs> = {
  argTypes: {
    max: { control: "number" },
    step: { control: "number" },
    disabled: { control: "boolean" },
  },
  args: {
    max: 100,
    step: 1,
    disabled: false,
  },
  render: (args) => (
    <Slider defaultValue={[50]} max={args.max} step={args.step} disabled={args.disabled} className="w-[200px]" />
  ),
};

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
