"use client";

import type { PageTab } from "@claudekit/ui/components/page-tabs";
import { PageTabs } from "@claudekit/ui/components/page-tabs";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { GeneralTab } from "@/components/settings/general-tab";
import { PreferencesTab } from "@/components/settings/preferences-tab";
import { SkillGroupsTab } from "@/components/settings/skill-groups-tab";
import type { GitHubUser, SkillGroup } from "@/lib/types";

interface Repo {
  id: string;
  owner: string;
  name: string;
  full_name: string;
  last_synced_at: string | null;
}

interface SettingsClientProps {
  repos: Repo[];
  settings: Record<string, string>;
  hasPAT: boolean;
  user: GitHubUser | null;
  skillGroups: SkillGroup[];
}

const settingsTabIds = ["general", "preferences", "skill-groups"] as const;

const tabs: PageTab[] = [
  { id: "general", label: "General" },
  { id: "preferences", label: "Preferences" },
  { id: "skill-groups", label: "Skill Groups" },
];

export function SettingsClient({ repos, settings, hasPAT, user, skillGroups }: SettingsClientProps) {
  const [currentTab, setCurrentTab] = useQueryState("tab", parseAsStringLiteral(settingsTabIds).withDefault("general"));

  return (
    <>
      <PageTabs tabs={tabs} value={currentTab} onValueChange={setCurrentTab} />
      <div className="max-w-5xl mx-auto w-full p-6 space-y-6">
        {currentTab === "general" && <GeneralTab repos={repos} hasPAT={hasPAT} user={user} />}
        {currentTab === "preferences" && <PreferencesTab settings={settings} />}
        {currentTab === "skill-groups" && <SkillGroupsTab initialGroups={skillGroups} />}
      </div>
    </>
  );
}
