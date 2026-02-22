"use server";

import { getSetting, setSetting } from "@/lib/actions/settings";
import { getDb, queryOne } from "@/lib/db";
import {
  deleteRuleFile,
  readClaudeMd,
  readRulesFiles,
  readSettingsJson,
  readSharedSettingsJson,
  writeClaudeMd,
  writeRuleFile,
  writeSettingsJson,
  writeSharedSettingsJson,
} from "@/lib/services/claude-config";
import { expandTilde } from "@/lib/utils";

export async function getClaudeConfig(repoId: string): Promise<{
  settingsJson: string | null;
  sharedSettingsJson: string | null;
  claudeMd: string | null;
  rules: { name: string; content: string }[];
  repoPath: string;
}> {
  const db = await getDb();
  const repo = await queryOne<{ local_path: string }>(db, "SELECT local_path FROM repos WHERE id = ?", [repoId]);

  if (!repo) {
    return { settingsJson: null, sharedSettingsJson: null, claudeMd: null, rules: [], repoPath: "" };
  }

  const expandedPath = expandTilde(repo.local_path);

  const settingsResult = await readSettingsJson(expandedPath);
  const sharedSettingsResult = await readSharedSettingsJson(expandedPath);
  const claudeMdContent = await readClaudeMd(expandedPath);
  const rules = await readRulesFiles(expandedPath);

  return {
    settingsJson: settingsResult?.content ?? null,
    sharedSettingsJson: sharedSettingsResult?.content ?? null,
    claudeMd: claudeMdContent,
    rules,
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

export async function saveSharedClaudeSettingsJson(repoId: string, content: string): Promise<void> {
  const db = await getDb();
  const repo = await queryOne<{ local_path: string }>(db, "SELECT local_path FROM repos WHERE id = ?", [repoId]);
  if (!repo) throw new Error("Repository not found");
  const expandedPath = expandTilde(repo.local_path);
  JSON.parse(content); // Validate JSON
  await writeSharedSettingsJson(expandedPath, content);
}

export async function saveRuleFile(repoId: string, name: string, content: string): Promise<void> {
  const db = await getDb();
  const repo = await queryOne<{ local_path: string }>(db, "SELECT local_path FROM repos WHERE id = ?", [repoId]);
  if (!repo) throw new Error("Repository not found");
  const expandedPath = expandTilde(repo.local_path);
  await writeRuleFile(expandedPath, name, content);
}

export async function removeRuleFile(repoId: string, name: string): Promise<void> {
  const db = await getDb();
  const repo = await queryOne<{ local_path: string }>(db, "SELECT local_path FROM repos WHERE id = ?", [repoId]);
  if (!repo) throw new Error("Repository not found");
  const expandedPath = expandTilde(repo.local_path);
  await deleteRuleFile(expandedPath, name);
}
