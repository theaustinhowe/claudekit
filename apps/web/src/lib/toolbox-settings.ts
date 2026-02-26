import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DEFAULT_TOOL_IDS } from "@/lib/constants/tools";

const SETTINGS_DIR = join(homedir(), ".claudekit");
const SETTINGS_PATH = join(SETTINGS_DIR, "toolbox-settings.json");

function ensureDir() {
  if (!existsSync(SETTINGS_DIR)) {
    mkdirSync(SETTINGS_DIR, { recursive: true });
  }
}

export function readToolboxSettings(): string[] {
  if (!existsSync(SETTINGS_PATH)) return DEFAULT_TOOL_IDS;
  try {
    const raw = readFileSync(SETTINGS_PATH, "utf-8");
    const ids = JSON.parse(raw);
    if (Array.isArray(ids) && ids.length > 0) return ids;
    return DEFAULT_TOOL_IDS;
  } catch {
    return DEFAULT_TOOL_IDS;
  }
}

export function writeToolboxSettings(ids: string[]): void {
  ensureDir();
  const tmp = `${SETTINGS_PATH}.tmp.${process.pid}`;
  writeFileSync(tmp, JSON.stringify(ids, null, 2));
  renameSync(tmp, SETTINGS_PATH);
}
