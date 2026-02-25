import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { Label } from "./label";
import { TimePicker } from "./time-picker";

const meta: Meta<typeof TimePicker> = {
  title: "Components/TimePicker",
  component: TimePicker,
  tags: ["autodocs"],
};
export default meta;

interface PlaygroundArgs {
  disabled: boolean;
  granularity: "hour-minute" | "hour-minute-second";
}

export const Playground: StoryObj<PlaygroundArgs> = {
  argTypes: {
    disabled: { control: "boolean" },
    granularity: { control: "select", options: ["hour-minute", "hour-minute-second"] },
  },
  args: {
    disabled: false,
    granularity: "hour-minute-second",
  },
  render: (args) => {
    const [value, setValue] = useState<string | undefined>();
    return (
      <div>
        <TimePicker
          value={value}
          onChange={(v) => setValue(v ?? undefined)}
          disabled={args.disabled}
          granularity={args.granularity}
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
      <div>
        <TimePicker value={value} onChange={(v) => setValue(v ?? undefined)} />
        <p className="text-xs text-muted-foreground mt-2">Value: {value ?? "none"}</p>
      </div>
    );
  },
};

export const WithValue: StoryObj = {
  render: () => {
    const [value, setValue] = useState<string | undefined>("14:30:45");
    return (
      <div>
        <TimePicker value={value} onChange={(v) => setValue(v ?? undefined)} />
        <p className="text-xs text-muted-foreground mt-2">Value: {value ?? "none"}</p>
      </div>
    );
  },
};

export const HourMinuteOnly: StoryObj = {
  render: () => {
    const [value, setValue] = useState<string | undefined>("09:15");
    return (
      <div>
        <TimePicker value={value} onChange={(v) => setValue(v ?? undefined)} granularity="hour-minute" />
        <p className="text-xs text-muted-foreground mt-2">Value: {value ?? "none"}</p>
      </div>
    );
  },
};

export const Disabled: StoryObj = {
  render: () => (
    <div>
      <TimePicker value="10:30:00" onChange={() => {}} disabled />
    </div>
  ),
};

export const WithLabel: StoryObj = {
  render: () => {
    const [value, setValue] = useState<string | undefined>();
    return (
      <div className="space-y-1.5">
        <Label>Start Time</Label>
        <TimePicker value={value} onChange={(v) => setValue(v ?? undefined)} />
      </div>
    );
  },
};
