import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { Label } from "./label";
import { TimestampPicker } from "./timestamp-picker";

const meta: Meta<typeof TimestampPicker> = {
  title: "Components/TimestampPicker",
  component: TimestampPicker,
  tags: ["autodocs"],
};
export default meta;

interface PlaygroundArgs {
  disabled: boolean;
  placeholder: string;
}

export const Playground: StoryObj<PlaygroundArgs> = {
  argTypes: {
    disabled: { control: "boolean" },
    placeholder: { control: "text" },
  },
  args: {
    disabled: false,
    placeholder: "Pick date & time",
  },
  render: (args) => {
    const [value, setValue] = useState<string | undefined>();
    return (
      <div className="max-w-xs">
        <TimestampPicker
          value={value}
          onChange={(v) => setValue(v ?? undefined)}
          disabled={args.disabled}
          placeholder={args.placeholder}
        />
        <p className="text-xs text-muted-foreground mt-2">Value: {value ?? "none"}</p>
      </div>
    );
  },
};

export const Default: StoryObj = {
  render: () => {
    const [value, setValue] = useState<string | undefined>();
    return (
      <div className="max-w-xs">
        <TimestampPicker value={value} onChange={(v) => setValue(v ?? undefined)} />
        <p className="text-xs text-muted-foreground mt-2">Value: {value ?? "none"}</p>
      </div>
    );
  },
};

export const Disabled: StoryObj = {
  render: () => (
    <div className="max-w-xs">
      <TimestampPicker value="2026-02-24T14:30:00" onChange={() => {}} disabled />
    </div>
  ),
};

export const WithLabel: StoryObj = {
  render: () => {
    const [value, setValue] = useState<string | undefined>();
    return (
      <div className="max-w-xs space-y-1.5">
        <Label>Created At</Label>
        <TimestampPicker value={value} onChange={(v) => setValue(v ?? undefined)} />
      </div>
    );
  },
};

export const WithValue: StoryObj = {
  render: () => {
    const [value, setValue] = useState<string | undefined>("2026-02-24T14:30:00");
    return (
      <div className="max-w-xs">
        <TimestampPicker value={value} onChange={(v) => setValue(v ?? undefined)} />
        <p className="text-xs text-muted-foreground mt-2">Value: {value ?? "none"}</p>
      </div>
    );
  },
};
