import type { Meta, StoryObj } from "@storybook/react";
import { SplitPanel } from "./split-panel";

const meta: Meta<typeof SplitPanel> = {
  title: "Components/SplitPanel",
  component: SplitPanel,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div style={{ height: "100vh", display: "flex" }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof SplitPanel>;

const LeftPanel = () => (
  <div className="h-full bg-muted/50 p-4 flex items-center justify-center">
    <div className="text-center">
      <div className="text-sm font-medium">Left Panel</div>
      <div className="text-xs text-muted-foreground mt-1">Drag the divider to resize</div>
    </div>
  </div>
);

const RightPanel = () => (
  <div className="h-full bg-accent/30 p-4 flex items-center justify-center">
    <div className="text-center">
      <div className="text-sm font-medium">Right Panel</div>
      <div className="text-xs text-muted-foreground mt-1">This panel fills the remaining space</div>
    </div>
  </div>
);

export const Default: Story = {
  args: {
    left: <LeftPanel />,
    right: <RightPanel />,
  },
};

export const CustomWidths: Story = {
  args: {
    left: <LeftPanel />,
    right: <RightPanel />,
    defaultWidth: 40,
    minWidth: 20,
    maxWidth: 80,
  },
};

export const CustomMobileLabels: Story = {
  args: {
    left: <LeftPanel />,
    right: <RightPanel />,
    mobileLabels: ["Editor", "Preview"],
  },
};
