"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { AppShell } from "../app-shell";
import { ContentBanner } from "./content-banner";
import { MobileBottomNav, MobileMenuButton, MobileSidebar } from "./mobile-nav";
import { SharedFooter } from "./shared-footer";
import { SharedHeader } from "./shared-header";
import { SharedSidebar } from "./shared-sidebar";
import type { AppLayoutProps } from "./types";

export function AppLayout({
  config,
  children,
  statusIndicator,
  contentBanner,
  contextSwitcher,
  sidebarContent,
  mobileSidebarContent,
  excludedPaths,
  showFooter = true,
}: AppLayoutProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Skip the shell for excluded paths (e.g. /setup)
  if (excludedPaths?.some((path) => pathname.startsWith(path))) {
    return <>{children}</>;
  }

  return (
    <>
      <AppShell
        sidebar={<SharedSidebar config={config} contextSwitcher={contextSwitcher} sidebarContent={sidebarContent} />}
        header={
          <>
            <SharedHeader
              claudeUsage={config.claudeUsage}
              statusIndicator={statusIndicator}
              mobileMenuButton={<MobileMenuButton onClick={() => setMobileMenuOpen(true)} />}
            />
            {contentBanner && <ContentBanner>{contentBanner}</ContentBanner>}
          </>
        }
        footer={showFooter ? <SharedFooter currentPort={config.port} /> : undefined}
      >
        <div className="pb-16 md:pb-0 flex-1 min-h-0 flex flex-col">{children}</div>
      </AppShell>

      <MobileBottomNav config={config} contextSwitcher={contextSwitcher} mobileSidebarContent={mobileSidebarContent} />

      <MobileSidebar
        config={config}
        open={mobileMenuOpen}
        onOpenChange={setMobileMenuOpen}
        contextSwitcher={contextSwitcher}
        mobileSidebarContent={mobileSidebarContent}
      />
    </>
  );
}
