import type { Meta, StoryObj } from "@storybook/react";
import { FolderKanban, Home, Layers, Search, Settings } from "lucide-react";
import { SharedSidebar } from "./shared-sidebar";
import type { AppLayoutConfig } from "./types";

function setMockPathname(pathname: string) {
  (globalThis as Record<string, unknown>).__STORYBOOK_PATHNAME__ = pathname;
}

const sampleConfig: AppLayoutConfig = {
  appId: "storybook",
  logo: {
    icon: <Layers className="w-6 h-6 text-primary" />,
    wordmark: <span className="text-sm font-semibold">Devkit</span>,
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
  bottomNav: [{ label: "Settings", href: "/settings", icon: Settings }],
  port: 2000,
};

const flatConfig: AppLayoutConfig = {
  ...sampleConfig,
  nav: [
    { label: "Home", href: "/", icon: Home },
    { label: "Search", href: "/search", icon: Search },
    { label: "Projects", href: "/projects", icon: FolderKanban },
    { label: "Settings", href: "/settings", icon: Settings },
  ],
  bottomNav: undefined,
};

const meta: Meta<typeof SharedSidebar> = {
  title: "Components/SharedLayout/SharedSidebar",
  component: SharedSidebar,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => {
      setMockPathname("/");
      return (
        <div style={{ height: "100vh", display: "flex" }}>
          <Story />
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">Page content</div>
        </div>
      );
    },
  ],
};
export default meta;

type Story = StoryObj<typeof SharedSidebar>;

export const Default: Story = {
  args: {
    config: sampleConfig,
  },
};

export const FlatNav: Story = {
  args: {
    config: flatConfig,
  },
};

export const WithContextSwitcher: Story = {
  args: {
    config: sampleConfig,
    contextSwitcher: ({ collapsed }: { collapsed: boolean }) => (
      <div className="rounded-md border px-2 py-1.5 text-xs text-muted-foreground truncate">
        {collapsed ? <FolderKanban className="w-4 h-4 mx-auto" /> : "my-project"}
      </div>
    ),
  },
};
