import type { Meta, StoryObj } from "@storybook/react";
import { Info } from "lucide-react";
import { ContentBanner } from "./content-banner";

const meta: Meta<typeof ContentBanner> = {
  title: "Components/SharedLayout/ContentBanner",
  component: ContentBanner,
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof ContentBanner>;

export const Default: Story = {
  render: () => (
    <ContentBanner>
      <div className="px-4 py-2 text-sm text-muted-foreground">
        This repository has not been audited yet. Run an audit to get started.
      </div>
    </ContentBanner>
  ),
};

export const WithIcon: Story = {
  render: () => (
    <ContentBanner>
      <div className="flex items-center gap-2 px-4 py-2 text-sm">
        <Info className="h-4 w-4 text-blue-500 shrink-0" />
        <span className="text-muted-foreground">3 new updates available for your project dependencies.</span>
      </div>
    </ContentBanner>
  ),
};
