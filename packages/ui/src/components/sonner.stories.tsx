import type { Meta, StoryObj } from "@storybook/react";
import { toast } from "sonner";
import { Button } from "./button";
import { Toaster } from "./sonner";

// Sonner depends on next-themes. In Storybook we provide a simple mock decorator.
function SonnerDecorator(Story: React.ComponentType) {
  return (
    <>
      <Story />
      <Toaster />
    </>
  );
}

const meta: Meta = {
  title: "Components/Sonner",
  tags: ["autodocs"],
  decorators: [SonnerDecorator],
};
export default meta;

type Story = StoryObj;

interface PlaygroundArgs {
  message: string;
  description: string;
  type: "default" | "success" | "error" | "info" | "warning";
}

export const Playground: StoryObj<PlaygroundArgs> = {
  argTypes: {
    message: { control: "text" },
    description: { control: "text" },
    type: {
      control: "select",
      options: ["default", "success", "error", "info", "warning"],
    },
  },
  args: {
    message: "Event has been created",
    description: "Sunday, December 03, 2023 at 9:00 AM",
    type: "default",
  },
  render: (args) => (
    <Button
      variant="outline"
      onClick={() => {
        const opts = args.description ? { description: args.description } : undefined;
        switch (args.type) {
          case "success":
            toast.success(args.message, opts);
            break;
          case "error":
            toast.error(args.message, opts);
            break;
          case "info":
            toast.info(args.message, opts);
            break;
          case "warning":
            toast.warning(args.message, opts);
            break;
          default:
            toast(args.message, opts);
        }
      }}
    >
      Show Toast
    </Button>
  ),
};

export const Default: Story = {
  render: () => (
    <Button variant="outline" onClick={() => toast("Event has been created")}>
      Show Toast
    </Button>
  ),
};

export const WithDescription: Story = {
  render: () => (
    <Button
      variant="outline"
      onClick={() =>
        toast("Event has been created", {
          description: "Sunday, December 03, 2023 at 9:00 AM",
        })
      }
    >
      Show Toast
    </Button>
  ),
};

export const Success: Story = {
  render: () => (
    <Button variant="outline" onClick={() => toast.success("Successfully saved!")}>
      Success Toast
    </Button>
  ),
};

export const ErrorToast: Story = {
  render: () => (
    <Button variant="outline" onClick={() => toast.error("Something went wrong")}>
      Error Toast
    </Button>
  ),
};
