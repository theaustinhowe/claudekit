import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { ColorSchemePicker } from "./color-scheme-picker";

const meta: Meta<typeof ColorSchemePicker> = {
  title: "Components/ColorSchemePicker",
  component: ColorSchemePicker,
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof ColorSchemePicker>;

function Controlled({ initial }: { initial: { primary?: string; accent?: string } }) {
  const [value, setValue] = useState(initial);
  return <ColorSchemePicker value={value} onChange={setValue} />;
}

export const Default: Story = {
  render: () => <Controlled initial={{}} />,
};

export const WithValues: Story = {
  render: () => <Controlled initial={{ primary: "#6366f1", accent: "#f59e0b" }} />,
};

export const PrimaryOnly: Story = {
  render: () => <Controlled initial={{ primary: "#3b82f6" }} />,
};

export const PresetSelected: Story = {
  render: () => <Controlled initial={{ primary: "#f43f5e", accent: "#06b6d4" }} />,
};
