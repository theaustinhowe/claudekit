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
