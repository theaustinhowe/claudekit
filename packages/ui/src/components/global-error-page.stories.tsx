import type { Meta, StoryObj } from "@storybook/react";
import { GlobalErrorPage } from "./global-error-page";

const meta: Meta<typeof GlobalErrorPage> = {
  title: "Components/GlobalErrorPage",
  component: GlobalErrorPage,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
};
export default meta;

export const Default: StoryObj<typeof GlobalErrorPage> = {
  render: () => <GlobalErrorPage reset={() => {}} />,
};
