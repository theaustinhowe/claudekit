import type { Meta, StoryObj } from "@storybook/react";
import { Home, Settings, User } from "lucide-react";
import { NavLink } from "./nav-link";

function setMockPathname(pathname: string) {
  (globalThis as Record<string, unknown>).__STORYBOOK_PATHNAME__ = pathname;
}

const meta: Meta<typeof NavLink> = {
  title: "Components/NavLink",
  component: NavLink,
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof NavLink>;

export const Active: Story = {
  decorators: [
    (Story) => {
      setMockPathname("/dashboard");
      return <Story />;
    },
  ],
  args: {
    href: "/dashboard",
    className: "text-sm px-3 py-2 rounded-md transition-colors",
    activeClassName: "bg-primary text-primary-foreground",
    children: "Dashboard",
  },
};

export const Inactive: Story = {
  decorators: [
    (Story) => {
      setMockPathname("/settings");
      return <Story />;
    },
  ],
  args: {
    href: "/dashboard",
    className: "text-sm px-3 py-2 rounded-md text-muted-foreground hover:text-foreground transition-colors",
    activeClassName: "bg-primary text-primary-foreground",
    children: "Dashboard",
  },
};

export const WithActiveClassName: Story = {
  decorators: [
    (Story) => {
      setMockPathname("/projects");
      return (
        <nav className="flex gap-2">
          <Story />
        </nav>
      );
    },
  ],
  render: () => (
    <>
      {[
        { href: "/dashboard", label: "Dashboard" },
        { href: "/projects", label: "Projects" },
        { href: "/settings", label: "Settings" },
      ].map(({ href, label }) => (
        <NavLink
          key={href}
          href={href}
          className="text-sm px-3 py-2 rounded-md text-muted-foreground hover:text-foreground transition-colors"
          activeClassName="bg-accent text-accent-foreground font-medium"
        >
          {label}
        </NavLink>
      ))}
    </>
  ),
};

export const WithIcon: Story = {
  decorators: [
    (Story) => {
      setMockPathname("/dashboard");
      return (
        <nav className="flex gap-2">
          <Story />
        </nav>
      );
    },
  ],
  render: () => (
    <>
      {[
        { href: "/dashboard", label: "Home", icon: Home },
        { href: "/profile", label: "Profile", icon: User },
        { href: "/settings", label: "Settings", icon: Settings },
      ].map(({ href, label, icon: Icon }) => (
        <NavLink
          key={href}
          href={href}
          className="flex items-center gap-2 text-sm px-3 py-2 rounded-md text-muted-foreground hover:text-foreground transition-colors"
          activeClassName="bg-accent text-accent-foreground font-medium"
        >
          <Icon className="h-4 w-4" />
          {label}
        </NavLink>
      ))}
    </>
  ),
};
