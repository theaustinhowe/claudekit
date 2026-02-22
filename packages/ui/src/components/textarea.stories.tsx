import type { Meta, StoryObj } from "@storybook/react";
import { Label } from "./label";
import { Textarea } from "./textarea";

const meta: Meta<typeof Textarea> = {
  title: "Components/Textarea",
  component: Textarea,
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof Textarea>;

interface PlaygroundArgs {
  placeholder: string;
  disabled: boolean;
  rows: number;
}

export const Playground: StoryObj<PlaygroundArgs> = {
  argTypes: {
    placeholder: { control: "text" },
    disabled: { control: "boolean" },
    rows: { control: "number" },
  },
  args: {
    placeholder: "Type your message here.",
    disabled: false,
    rows: 4,
  },
  render: (args) => <Textarea placeholder={args.placeholder} disabled={args.disabled} rows={args.rows} />,
};

export const Default: Story = {
  args: { placeholder: "Type your message here." },
};

export const WithLabel: Story = {
  render: () => (
    <div className="grid w-full gap-1.5">
      <Label htmlFor="message">Your message</Label>
      <Textarea id="message" placeholder="Type your message here." />
    </div>
  ),
};

export const Disabled: Story = {
  args: { disabled: true, placeholder: "Disabled" },
};

export const WithPlaceholder: Story = {
  args: { placeholder: "Enter your bio here. Tell us about yourself..." },
};

export const WithMaxLength: Story = {
  render: () => (
    <div className="grid w-full gap-1.5">
      <Label htmlFor="limited">Comment (max 280 characters)</Label>
      <Textarea id="limited" maxLength={280} placeholder="Write a comment..." />
      <p className="text-xs text-muted-foreground">Maximum 280 characters.</p>
    </div>
  ),
};
