import type { Meta, StoryObj } from "@storybook/react";
import { SharedHeader } from "./shared-header";

const meta: Meta<typeof SharedHeader> = {
  title: "Components/SharedLayout/SharedHeader",
  component: SharedHeader,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
};
export default meta;

type Story = StoryObj<typeof SharedHeader>;

export const Default: Story = {
  args: {
    statusIndicator: (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="w-2 h-2 rounded-full bg-green-500" />
        Connected
      </div>
    ),
  },
};

export const WithUsageWidget: Story = {
  args: {
    usageWidget: (
      <div className="flex-1 hidden sm:block">
        <button
          type="button"
          className="hidden sm:flex items-center gap-2.5 h-8 px-3 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer"
        >
          <span className="tabular-nums whitespace-nowrap">142 sessions</span>
          <span className="text-border">|</span>
          <span className="tabular-nums whitespace-nowrap">3,891 msgs</span>
          <span className="text-border">|</span>
          <span className="tabular-nums whitespace-nowrap text-amber-500">~$2.47</span>
        </button>
      </div>
    ),
    statusIndicator: (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="w-2 h-2 rounded-full bg-green-500" />
        Connected
      </div>
    ),
  },
};
