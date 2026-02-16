"use client";

import { AppLayout } from "@devkit/ui/components/shared-layout";
import { RepoSelector } from "@/components/repo/repo-selector";
import { ConnectionBadge } from "./connection-badge";
import { gogoLayoutConfig } from "./layout-config";

export function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppLayout
      config={gogoLayoutConfig}
      statusIndicator={<ConnectionBadge />}
      contextSwitcher={RepoSelector}
      excludedPaths={["/setup"]}
    >
      {children}
    </AppLayout>
  );
}
