import type { Meta, StoryObj } from "@storybook/react";
import { NotFoundPage } from "./not-found-page";

const meta: Meta<typeof NotFoundPage> = {
  title: "Components/NotFoundPage",
  component: NotFoundPage,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
};
export default meta;

export const Playground: StoryObj<typeof NotFoundPage> = {
  argTypes: {
    returnLabel: { control: "text" },
    returnHref: { control: "text" },
  },
  args: {
    returnLabel: "Return to Dashboard",
    returnHref: "/",
  },
};

export const CustomReturn: StoryObj<typeof NotFoundPage> = {
  args: {
    returnLabel: "Back to Projects",
    returnHref: "/projects",
  },
};
