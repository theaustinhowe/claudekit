import type { Meta, StoryObj } from "@storybook/react";
import { SharedFooter } from "./shared-footer";

const meta: Meta<typeof SharedFooter> = {
  title: "Components/SharedLayout/SharedFooter",
  component: SharedFooter,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
};
export default meta;

type Story = StoryObj<typeof SharedFooter>;

export const Default: Story = {
  args: { currentPort: 2000 },
};

export const GadgetActive: Story = {
  args: { currentPort: 2100 },
};
