import type { Metadata } from "next";
import { getSetting } from "@/lib/actions/settings";
import { SettingsClient } from "./settings-client";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const defaultProjectPath = (await getSetting("default_project_path")) ?? "";

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-auto">
        <SettingsClient defaultProjectPath={defaultProjectPath} />
      </div>
    </div>
  );
}
