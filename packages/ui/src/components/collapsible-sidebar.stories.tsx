import type { Meta, StoryObj } from "@storybook/react";
import { Home, Layers, Settings } from "lucide-react";
import { cn } from "../utils";
import { CollapsibleSidebar, SidebarLogo } from "./collapsible-sidebar";

const meta: Meta<typeof CollapsibleSidebar> = {
  title: "Components/CollapsibleSidebar",
  component: CollapsibleSidebar,
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

type Story = StoryObj<typeof CollapsibleSidebar>;

const navItems = [
  { icon: Home, label: "Dashboard" },
  { icon: Layers, label: "Projects" },
  { icon: Settings, label: "Settings" },
];

export const Default: Story = {
  args: {
    children: ({ collapsed }) => (
      <nav className="flex flex-col gap-1 p-2 mt-4">
        {navItems.map(({ icon: Icon, label }) => (
          <button
            key={label}
            type="button"
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent transition-colors",
              collapsed && "justify-center px-2",
            )}
          >
            <Icon className="w-4 h-4 shrink-0" />
            {!collapsed && <span>{label}</span>}
          </button>
        ))}
      </nav>
    ),
  },
};

export const Collapsed: Story = {
  args: {
    defaultCollapsed: true,
    children: ({ collapsed }) => (
      <nav className="flex flex-col gap-1 p-2 mt-4">
        {navItems.map(({ icon: Icon, label }) => (
          <button
            key={label}
            type="button"
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent transition-colors",
              collapsed && "justify-center px-2",
            )}
          >
            <Icon className="w-4 h-4 shrink-0" />
            {!collapsed && <span>{label}</span>}
          </button>
        ))}
      </nav>
    ),
  },
};

export const WithLogo: Story = {
  args: {
    children: ({ collapsed }) => (
      <div className="flex flex-col">
        <div className="p-3 border-b border-sidebar-border">
          <SidebarLogo
            collapsed={collapsed}
            icon={<Layers className="w-6 h-6 text-primary mx-auto" />}
            wordmark={<span className="text-sm font-semibold text-sidebar-foreground">Devkit</span>}
          />
        </div>
        <nav className="flex flex-col gap-1 p-2 mt-2">
          {navItems.map(({ icon: Icon, label }) => (
            <button
              key={label}
              type="button"
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent transition-colors",
                collapsed && "justify-center px-2",
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!collapsed && <span>{label}</span>}
            </button>
          ))}
        </nav>
      </div>
    ),
  },
};
