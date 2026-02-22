import type { Meta, StoryObj } from "@storybook/react";
import { Skeleton } from "./skeleton";

const meta: Meta<typeof Skeleton> = {
  title: "Components/Skeleton",
  component: Skeleton,
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof Skeleton>;

interface PlaygroundArgs {
  width: string;
  height: string;
}

export const Playground: StoryObj<PlaygroundArgs> = {
  argTypes: {
    width: { control: "text" },
    height: { control: "text" },
  },
  args: {
    width: "200px",
    height: "20px",
  },
  render: (args) => <Skeleton style={{ width: args.width, height: args.height }} />,
};

export const Default: Story = {
  render: () => (
    <div className="flex items-center space-x-4">
      <Skeleton className="h-12 w-12 rounded-full" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-[250px]" />
        <Skeleton className="h-4 w-[200px]" />
      </div>
    </div>
  ),
};

export const Card: Story = {
  render: () => (
    <div className="space-y-3">
      <Skeleton className="h-[125px] w-[250px] rounded-xl" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-[250px]" />
        <Skeleton className="h-4 w-[200px]" />
      </div>
    </div>
  ),
};

export const TextLines: Story = {
  render: () => (
    <div className="space-y-2 w-[300px]">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-[260px]" />
      <Skeleton className="h-4 w-[220px]" />
      <Skeleton className="h-4 w-[280px]" />
    </div>
  ),
};

export const Avatar: Story = {
  render: () => <Skeleton className="h-16 w-16 rounded-full" />,
};
