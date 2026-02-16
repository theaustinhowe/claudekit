import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "./button";
import { Input } from "./input";
import { Label } from "./label";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

const meta: Meta<typeof Popover> = {
  title: "Components/Popover",
  component: Popover,
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof Popover>;

interface PlaygroundArgs {
  side: "top" | "bottom" | "left" | "right";
  align: "start" | "center" | "end";
  sideOffset: number;
}

export const Playground: StoryObj<PlaygroundArgs> = {
  argTypes: {
    side: {
      control: "select",
      options: ["bottom", "top", "left", "right"],
    },
    align: {
      control: "select",
      options: ["center", "start", "end"],
    },
    sideOffset: { control: "number" },
  },
  args: {
    side: "bottom",
    align: "center",
    sideOffset: 4,
  },
  render: (args) => (
    <div className="flex items-center justify-center p-24">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline">Open popover</Button>
        </PopoverTrigger>
        <PopoverContent side={args.side} align={args.align} sideOffset={args.sideOffset} className="w-80">
          <div className="grid gap-4">
            <div className="space-y-2">
              <h4 className="font-medium leading-none">Dimensions</h4>
              <p className="text-sm text-muted-foreground">Set the dimensions for the layer.</p>
            </div>
            <div className="grid gap-2">
              <div className="grid grid-cols-3 items-center gap-4">
                <Label htmlFor="pg-width">Width</Label>
                <Input id="pg-width" defaultValue="100%" className="col-span-2 h-8" />
              </div>
              <div className="grid grid-cols-3 items-center gap-4">
                <Label htmlFor="pg-height">Height</Label>
                <Input id="pg-height" defaultValue="25px" className="col-span-2 h-8" />
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  ),
};

export const Default: Story = {
  render: () => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">Open popover</Button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="grid gap-4">
          <div className="space-y-2">
            <h4 className="font-medium leading-none">Dimensions</h4>
            <p className="text-sm text-muted-foreground">Set the dimensions for the layer.</p>
          </div>
          <div className="grid gap-2">
            <div className="grid grid-cols-3 items-center gap-4">
              <Label htmlFor="width">Width</Label>
              <Input id="width" defaultValue="100%" className="col-span-2 h-8" />
            </div>
            <div className="grid grid-cols-3 items-center gap-4">
              <Label htmlFor="height">Height</Label>
              <Input id="height" defaultValue="25px" className="col-span-2 h-8" />
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  ),
};

export const TopSide: Story = {
  render: () => (
    <div className="flex items-end h-[200px]">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline">Open top</Button>
        </PopoverTrigger>
        <PopoverContent side="top" className="w-64">
          <p className="text-sm">This popover opens above the trigger.</p>
        </PopoverContent>
      </Popover>
    </div>
  ),
};

export const LeftSide: Story = {
  render: () => (
    <div className="flex justify-end">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline">Open left</Button>
        </PopoverTrigger>
        <PopoverContent side="left" className="w-64">
          <p className="text-sm">This popover opens to the left of the trigger.</p>
        </PopoverContent>
      </Popover>
    </div>
  ),
};

export const AlignStart: Story = {
  render: () => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">Align start</Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64">
        <p className="text-sm">This popover is aligned to the start of the trigger.</p>
      </PopoverContent>
    </Popover>
  ),
};
