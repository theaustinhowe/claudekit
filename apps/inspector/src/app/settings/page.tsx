import { getConnectedRepos } from "@/lib/actions/github";
import { getSettings } from "@/lib/actions/settings";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage() {
  const repos = await getConnectedRepos();
  const settings = await getSettings(["min_split_size", "ignore_bots", "temperature", "feedback_categories"]);

  return <SettingsClient repos={repos} settings={settings} />;
}
