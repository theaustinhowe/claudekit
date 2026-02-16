import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { Button } from "./button";
import { ErrorBoundary } from "./error-boundary";

const meta: Meta<typeof ErrorBoundary> = {
  title: "Components/ErrorBoundary",
  component: ErrorBoundary,
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof ErrorBoundary>;

export const Default: Story = {
  args: {
    children: (
      <div className="p-6 text-center">
        <div className="text-sm font-medium">Normal Content</div>
        <div className="text-xs text-muted-foreground mt-1">This content renders without errors</div>
      </div>
    ),
  },
};

function BuggyComponent() {
  const [shouldThrow, setShouldThrow] = useState(false);
  if (shouldThrow) throw new Error("Something broke!");
  return (
    <div className="p-6 text-center space-y-3">
      <div className="text-sm">Click the button to trigger an error</div>
      <Button variant="destructive" size="sm" onClick={() => setShouldThrow(true)}>
        Throw Error
      </Button>
    </div>
  );
}

export const ErrorState: Story = {
  render: () => (
    <ErrorBoundary>
      <BuggyComponent />
    </ErrorBoundary>
  ),
};

export const WithFallbackLabel: Story = {
  render: () => (
    <ErrorBoundary fallbackLabel="Failed to load dashboard widget">
      <BuggyComponent />
    </ErrorBoundary>
  ),
};
