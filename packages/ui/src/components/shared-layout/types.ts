import type { ComponentType, ReactNode } from "react";

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

export interface NavItem {
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  badge?: ReactNode | ComponentType<{ collapsed: boolean }>;
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

// ---------------------------------------------------------------------------
// Logo
// ---------------------------------------------------------------------------

export interface LogoConfig {
  icon: ReactNode;
  wordmark: ReactNode;
  href?: string;
}

// ---------------------------------------------------------------------------
// Claude Usage (dependency injection for server actions)
// ---------------------------------------------------------------------------

export interface ClaudeUsageActions {
  getUsageStats: () => Promise<unknown>;
  getRateLimits: () => Promise<unknown>;
}

// ---------------------------------------------------------------------------
// Cross-app footer links
// ---------------------------------------------------------------------------

export interface DevkitAppLink {
  label: string;
  port: number;
  icon: ComponentType<{ className?: string }>;
}

// ---------------------------------------------------------------------------
// Layout config — one per app
// ---------------------------------------------------------------------------

export interface AppLayoutConfig {
  appId: string;
  logo: LogoConfig;
  nav: NavItem[] | NavGroup[];
  bottomNav?: NavItem[];
  mobileNav?: NavItem[];
  claudeUsage?: ClaudeUsageActions;
  port: number;
}

// ---------------------------------------------------------------------------
// Layout props — passed to <AppLayout>
// ---------------------------------------------------------------------------

export interface AppLayoutProps {
  config: AppLayoutConfig;
  children: ReactNode;
  statusIndicator?: ReactNode;
  contentBanner?: ReactNode;
  contextSwitcher?: ComponentType<{ collapsed: boolean }>;
  sidebarContent?: ComponentType<{ collapsed: boolean }>;
  mobileSidebarContent?: ComponentType<{ onNavigate: () => void }>;
  excludedPaths?: string[];
  showFooter?: boolean;
}
