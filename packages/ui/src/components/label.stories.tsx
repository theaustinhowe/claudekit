import type { Meta, StoryObj } from "@storybook/react";
import { Checkbox } from "./checkbox";
import { Input } from "./input";
import { Label } from "./label";

const meta: Meta<typeof Label> = {
  title: "Components/Label",
  component: Label,
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof Label>;

export const Default: Story = {
  args: { children: "Email address" },
};

export const WithCheckbox: Story = {
  render: () => (
    <div className="flex items-center space-x-2">
      <Checkbox id="terms" />
      <Label htmlFor="terms">Accept terms and conditions</Label>
    </div>
  ),
};

export const WithInput: Story = {
  render: () => (
    <div className="grid w-full max-w-sm items-center gap-1.5">
      <Label htmlFor="email">Email</Label>
      <Input type="email" id="email" placeholder="Email" />
    </div>
  ),
};
