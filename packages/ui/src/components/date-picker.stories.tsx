import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { DatePicker } from "./date-picker";
import { Label } from "./label";

const meta: Meta<typeof DatePicker> = {
  title: "Components/DatePicker",
  component: DatePicker,
  tags: ["autodocs"],
};
export default meta;

interface PlaygroundArgs {
  placeholder: string;
  disabled: boolean;
}

export const Playground: StoryObj<PlaygroundArgs> = {
  argTypes: {
    placeholder: { control: "text" },
    disabled: { control: "boolean" },
  },
  args: {
    placeholder: "Pick a date",
    disabled: false,
  },
  render: (args) => {
    const [value, setValue] = useState<string | undefined>();
    return (
      <div className="w-64">
        <DatePicker
          value={value ?? undefined}
          onChange={(v) => setValue(v ?? undefined)}
          placeholder={args.placeholder}
          disabled={args.disabled}
        />
      </div>
    );
  },
};

export const CustomPlaceholder: StoryObj = {
  render: () => {
    const [value, setValue] = useState<string | undefined>();
    return (
      <div className="w-64">
        <DatePicker value={value} onChange={(v) => setValue(v ?? undefined)} placeholder="Select start date..." />
      </div>
    );
  },
};

export const Default: StoryObj = {
  render: () => {
    const [value, setValue] = useState<string | undefined>();
    return (
      <div className="w-64">
        <DatePicker value={value} onChange={(v) => setValue(v ?? undefined)} />
      </div>
    );
  },
};

export const Disabled: StoryObj = {
  render: () => (
    <div className="w-64">
      <DatePicker value="2026-02-24" onChange={() => {}} disabled />
    </div>
  ),
};

export const WithLabel: StoryObj = {
  render: () => {
    const [value, setValue] = useState<string | undefined>();
    return (
      <div className="w-64 space-y-1.5">
        <Label>Start Date</Label>
        <DatePicker value={value} onChange={(v) => setValue(v ?? undefined)} />
      </div>
    );
  },
};

export const WithValue: StoryObj = {
  render: () => {
    const [value, setValue] = useState<string | undefined>("2026-02-24");
    return (
      <div className="w-64">
        <DatePicker value={value} onChange={(v) => setValue(v ?? undefined)} />
      </div>
    );
  },
};
