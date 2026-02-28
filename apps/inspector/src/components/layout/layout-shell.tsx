"use client";

import { AppLayout } from "@claudekit/ui/components/shared-layout";
import { RepoSelector } from "@/components/repo/repo-selector";
import { InspectorSessionProvider } from "@/components/sessions/session-context";
import { SessionIndicator } from "@/components/sessions/session-indicator";
import { SessionPanel } from "@/components/sessions/session-panel";
import { type Repo, RepoProvider } from "@/contexts/repo-context";
import { inspectorLayoutConfig } from "./layout-config";

interface LayoutShellProps {
  children: React.ReactNode;
  repos: Repo[];
}

export function LayoutShell({ children, repos }: LayoutShellProps) {
  return (
    <RepoProvider repos={repos}>
      <InspectorSessionProvider>
        <AppLayout
          config={inspectorLayoutConfig}
          statusIndicator={<SessionIndicator />}
          contextSwitcher={repos.length > 0 ? RepoSelector : undefined}
        >
          {children}
        </AppLayout>
        <SessionPanel />
      </InspectorSessionProvider>
    </RepoProvider>
  );
}
