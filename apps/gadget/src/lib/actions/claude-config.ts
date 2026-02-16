"use server";

import { getSetting, setSetting } from "@/lib/actions/settings";
import { getDb } from "@/lib/db";
import { queryOne } from "@/lib/db/helpers";
import { readClaudeMd, readSettingsJson, writeClaudeMd, writeSettingsJson } from "@/lib/services/claude-config";
import { expandTilde } from "@/lib/utils";

export async function getClaudeConfig(repoId: string): Promise<{
  settingsJson: string | null;
  claudeMd: string | null;
  repoPath: string;
}> {
  const db = await getDb();
  const repo = await queryOne<{ local_path: string }>(db, "SELECT local_path FROM repos WHERE id = ?", [repoId]);

  if (!repo) {
    return { settingsJson: null, claudeMd: null, repoPath: "" };
  }

  const expandedPath = expandTilde(repo.local_path);

  const settingsResult = await readSettingsJson(expandedPath);
  const claudeMdContent = await readClaudeMd(expandedPath);

  return {
    settingsJson: settingsResult?.content ?? null,
    claudeMd: claudeMdContent,
    repoPath: expandedPath,
  };
}

export async function saveClaudeSettingsJson(repoId: string, content: string): Promise<void> {
  const db = await getDb();
  const repo = await queryOne<{ local_path: string }>(db, "SELECT local_path FROM repos WHERE id = ?", [repoId]);

  if (!repo) throw new Error("Repository not found");

  const expandedPath = expandTilde(repo.local_path);

  // Validate JSON
  JSON.parse(content);

  await writeSettingsJson(expandedPath, content);
}

export async function saveClaudeMd(repoId: string, content: string): Promise<void> {
  const db = await getDb();
  const repo = await queryOne<{ local_path: string }>(db, "SELECT local_path FROM repos WHERE id = ?", [repoId]);

  if (!repo) throw new Error("Repository not found");

  const expandedPath = expandTilde(repo.local_path);

  await writeClaudeMd(expandedPath, content);
}

const DEFAULT_SETTINGS_KEY = "claude_settings_default";

export async function saveDefaultClaudeSettings(json: string): Promise<void> {
  JSON.parse(json); // validate
  await setSetting(DEFAULT_SETTINGS_KEY, json);
}

export async function getDefaultClaudeSettings(): Promise<string | null> {
  return getSetting(DEFAULT_SETTINGS_KEY);
}
