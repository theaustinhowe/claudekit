import type { Meta, StoryObj } from "@storybook/react";
import { AboutCard } from "./about-card";

const meta: Meta<typeof AboutCard> = {
  title: "Components/AboutCard",
  component: AboutCard,
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof AboutCard>;

export const Default: Story = {
  args: {
    appName: "Gadget",
    version: "1.0.0-beta",
    port: 2100,
  },
};

export const WithChildren: Story = {
  args: {
    appName: "Gadget",
    version: "1.0.0-beta",
    port: 2100,
  },
  render: (args) => (
    <AboutCard {...args}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Dev Server Cleanup</p>
          <p className="text-sm text-muted-foreground">No dev servers running</p>
        </div>
        <button type="button" className="px-3 py-1.5 text-sm border rounded-md">
          Stop All
        </button>
      </div>
    </AboutCard>
  ),
};

export const AllApps: Story = {
  render: () => (
    <div className="space-y-4 max-w-lg">
      <AboutCard appName="Gadget" version="1.0.0-beta" port={2100} />
      <AboutCard appName="Inside" version="0.1.0" port={2150} />
      <AboutCard appName="Inspector" version="0.1.0" port={2400} />
      <AboutCard appName="GoGo" version="0.1.0" port={2200} />
    </div>
  ),
};
