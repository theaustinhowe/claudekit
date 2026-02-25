import type { Meta, StoryObj } from "@storybook/react";
import { FolderKanban, Home, Info, Layers, Search } from "lucide-react";
import { AppLayout } from "./app-layout";
import type { AppLayoutConfig } from "./types";

function setMockPathname(pathname: string) {
  (globalThis as Record<string, unknown>).__STORYBOOK_PATHNAME__ = pathname;
}

const sampleConfig: AppLayoutConfig = {
  appId: "storybook",
  logo: {
    icon: <Layers className="w-6 h-6 text-primary" />,
    wordmark: <span className="text-sm font-semibold">ClaudeKit</span>,
  },
  nav: [
    {
      label: "Main",
      items: [
        { label: "Home", href: "/", icon: Home },
        { label: "Search", href: "/search", icon: Search },
        { label: "Projects", href: "/projects", icon: FolderKanban },
      ],
    },
  ],
  port: 2000,
};

const meta: Meta<typeof AppLayout> = {
  title: "Components/SharedLayout/AppLayout",
  component: AppLayout,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => {
      setMockPathname("/");
      return (
        <div style={{ height: "100vh" }}>
          <Story />
        </div>
      );
    },
  ],
};
export default meta;

type Story = StoryObj<typeof AppLayout>;

export const Default: Story = {
  args: {
    config: sampleConfig,
    children: (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center space-y-2">
          <h2 className="text-lg font-medium text-foreground">Welcome to ClaudeKit</h2>
          <p className="text-sm">This is the main content area.</p>
        </div>
      </div>
    ),
  },
};

export const WithContentBanner: Story = {
  args: {
    config: sampleConfig,
    contentBanner: (
      <div className="flex items-center gap-2 px-4 py-2 text-sm">
        <Info className="h-4 w-4 text-blue-500 shrink-0" />
        <span className="text-muted-foreground">New version available. Restart to update.</span>
      </div>
    ),
    children: <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">Page content</div>,
  },
};

export const WithoutFooter: Story = {
  args: {
    config: sampleConfig,
    showFooter: false,
    children: (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        No footer in this layout
      </div>
    ),
  },
};
