import type { Meta, StoryObj } from "@storybook/react";
import { FolderKanban, Home, Layers, Search, Settings } from "lucide-react";
import type { ComponentType } from "react";
import { MobileBottomNav, MobileMenuButton, MobileSidebar } from "./mobile-nav";
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
    { label: "Home", href: "/", icon: Home },
    { label: "Search", href: "/search", icon: Search },
    { label: "Projects", href: "/projects", icon: FolderKanban },
    { label: "Settings", href: "/settings", icon: Settings },
  ],
  bottomNav: [{ label: "Settings", href: "/settings", icon: Settings }],
  port: 2000,
};

const mobileOverride = (Story: ComponentType) => (
  <>
    <style>{`.md\\:hidden { display: block !important; } .safe-bottom { padding-bottom: 0; }`}</style>
    <Story />
  </>
);

const meta: Meta = {
  title: "Components/SharedLayout/MobileNav",
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
};
export default meta;

type Story = StoryObj;

export const MenuButton: Story = {
  decorators: [mobileOverride],
  render: () => (
    <div className="p-4">
      <MobileMenuButton onClick={() => {}} />
    </div>
  ),
};

export const BottomNavBar: Story = {
  decorators: [
    mobileOverride,
    (Story) => {
      setMockPathname("/");
      return (
        <div style={{ height: "100vh", position: "relative" }}>
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">Page content</div>
          <Story />
        </div>
      );
    },
  ],
  render: () => <MobileBottomNav config={sampleConfig} />,
};

export const SidebarSheet: Story = {
  decorators: [
    (Story) => {
      setMockPathname("/");
      return <Story />;
    },
  ],
  render: () => <MobileSidebar config={sampleConfig} open={true} onOpenChange={() => {}} />,
};
