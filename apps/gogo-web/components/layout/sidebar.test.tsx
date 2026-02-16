import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@devkit/hooks", () => ({
  useIsMobile: () => false,
}));

vi.mock("@/hooks/use-jobs", () => ({
  useJobs: () => ({
    data: {
      data: [
        { id: "j1", status: "needs_info" },
        { id: "j2", status: "running" },
      ],
    },
  }),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

vi.mock("next/image", () => ({
  default: (props: { alt: string; src: string }) => <img alt={props.alt} src={props.src} />,
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/repo/repo-selector", () => ({
  RepoSelector: ({ collapsed }: { collapsed: boolean }) => (
    <div data-testid="repo-selector" data-collapsed={collapsed} />
  ),
}));

// Mock @devkit/ui components
vi.mock("@devkit/ui/components/collapsible-sidebar", () => ({
  CollapsibleSidebar: ({ children }: { children: (opts: { collapsed: boolean }) => ReactNode }) => (
    <aside data-testid="sidebar">{children({ collapsed: false })}</aside>
  ),
  SidebarLogo: ({ collapsed }: { collapsed: boolean }) => <div data-testid="sidebar-logo" data-collapsed={collapsed} />,
}));

vi.mock("@devkit/ui/components/nav-link", () => ({
  NavLink: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

vi.mock("@devkit/ui/components/sheet", () => ({
  Sheet: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

vi.mock("@devkit/ui/components/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TooltipContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TooltipProvider: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@devkit/ui/components/button", () => ({
  Button: ({ children, ...props }: { children: ReactNode }) => <button {...props}>{children}</button>,
}));

vi.mock("@devkit/ui", () => ({
  cn: (...args: string[]) => args.filter(Boolean).join(" "),
}));

import { AppSidebar, MobileBottomNav, MobileMenuButton } from "@/components/layout/sidebar";

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("Sidebar", () => {
  afterEach(() => {
    cleanup();
  });

  describe("AppSidebar", () => {
    it("renders navigation items", () => {
      render(<AppSidebar />, { wrapper: createWrapper() });

      expect(screen.getByText("Dashboard")).toBeInTheDocument();
      expect(screen.getByText("Issues")).toBeInTheDocument();
      expect(screen.getByText("Research")).toBeInTheDocument();
      expect(screen.getByText("Workspaces")).toBeInTheDocument();
      expect(screen.getByText("Archive")).toBeInTheDocument();
      expect(screen.getByText("Settings")).toBeInTheDocument();
    });

    it("renders repo selector", () => {
      render(<AppSidebar />, { wrapper: createWrapper() });
      expect(screen.getByTestId("repo-selector")).toBeInTheDocument();
    });

    it("shows blocked badge count for needs_info jobs", () => {
      render(<AppSidebar />, { wrapper: createWrapper() });
      // needs_info count = 1 job
      expect(screen.getByText("1")).toBeInTheDocument();
    });

    it("renders sidebar container", () => {
      render(<AppSidebar />, { wrapper: createWrapper() });
      expect(screen.getByTestId("sidebar")).toBeInTheDocument();
    });
  });

  describe("MobileBottomNav", () => {
    it("renders bottom navigation items", () => {
      render(<MobileBottomNav />, { wrapper: createWrapper() });

      // Items may appear both in bottom nav and in the "More" sheet
      expect(screen.getAllByText("Dashboard").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Issues").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Research").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Workspaces").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("More")).toBeInTheDocument();
    });
  });

  describe("MobileMenuButton", () => {
    it("calls onClick when pressed", () => {
      const onClick = vi.fn();
      render(<MobileMenuButton onClick={onClick} />);

      screen.getByRole("button").click();
      expect(onClick).toHaveBeenCalled();
    });
  });
});
