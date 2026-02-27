import { getAuthenticatedUser, hasValidPAT } from "@/lib/actions/account";
import { getConnectedRepos } from "@/lib/actions/github";
import { getSettings } from "@/lib/actions/settings";
import { getSkillGroups } from "@/lib/actions/skill-groups";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage() {
  const [hasPAT, repos, settings, skillGroups] = await Promise.all([
    hasValidPAT(),
    getConnectedRepos(),
    getSettings(["min_split_size", "ignore_bots", "temperature", "feedback_categories"]),
    getSkillGroups(),
  ]);

  const user = hasPAT ? await getAuthenticatedUser() : null;

  return <SettingsClient repos={repos} settings={settings} hasPAT={hasPAT} user={user} skillGroups={skillGroups} />;
}
