"use client";

import { ScrollArea } from "@devkit/ui/components/scroll-area";
import { Skeleton } from "@devkit/ui/components/skeleton";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { Suspense } from "react";
import { PageTabs, type Tab } from "@/components/layout/page-tabs";
import { AgentsSettings } from "@/components/settings/agents-settings";
import { ConnectDevice } from "@/components/settings/connect-device";
import { GeneralSettings } from "@/components/settings/general-settings";
import { GitHubSettings } from "@/components/settings/github-settings";
import { RepositoriesSettings } from "@/components/settings/repositories-settings";
import { useSettings } from "@/hooks/use-settings";

const tabIds = ["general", "github", "agents", "repositories", "connect"] as const;
type TabId = (typeof tabIds)[number];

const tabs: Tab[] = [
  { id: "general", label: "General" },
  { id: "github", label: "GitHub" },
  { id: "agents", label: "Agents" },
  { id: "repositories", label: "Repositories" },
  { id: "connect", label: "Connect" },
];

function SettingsPageSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <PageTabs tabs={tabs} value="general" onValueChange={() => {}} />
      <div className="mx-auto max-w-2xl p-4 sm:p-6">
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );
}

function SettingsContent({ currentTab }: { currentTab: TabId }) {
  const { isLoading } = useSettings();

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl p-4 sm:p-6">
        <div className="space-y-6">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <div className="space-y-6">
        {currentTab === "general" && <GeneralSettings />}
        {currentTab === "github" && <GitHubSettings />}
        {currentTab === "agents" && <AgentsSettings />}
        {currentTab === "repositories" && <RepositoriesSettings />}
        {currentTab === "connect" && <ConnectDevice />}
      </div>
    </div>
  );
}

function SettingsPageContent() {
  const [currentTab, setCurrentTab] = useQueryState("tab", parseAsStringLiteral(tabIds).withDefault("general"));

  return (
    <div className="flex h-full flex-col">
      <PageTabs tabs={tabs} value={currentTab} onValueChange={setCurrentTab} />
      <ScrollArea className="flex-1">
        <SettingsContent currentTab={currentTab} />
      </ScrollArea>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<SettingsPageSkeleton />}>
      <SettingsPageContent />
    </Suspense>
  );
}
