"use server";

import { getSetting, setSetting } from "@/lib/actions/settings";
import { DEFAULT_TOOL_IDS } from "@/lib/constants/tools";

const SETTINGS_KEY = "toolbox_tools";

export async function getToolboxToolIds(): Promise<string[]> {
  const raw = await getSetting(SETTINGS_KEY);
  if (!raw) return DEFAULT_TOOL_IDS;

  try {
    const ids = JSON.parse(raw);
    if (Array.isArray(ids) && ids.length > 0) return ids;
    return DEFAULT_TOOL_IDS;
  } catch {
    return DEFAULT_TOOL_IDS;
  }
}

export async function setToolboxToolIds(ids: string[]): Promise<void> {
  await setSetting(SETTINGS_KEY, JSON.stringify(ids));
}
