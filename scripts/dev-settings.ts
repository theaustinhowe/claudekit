import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface PerAppSettings {
  autoStart: boolean;
  autoRestart: boolean;
}

export interface AppSettings {
  version: 1;
  apps: Record<string, PerAppSettings>;
}

const SETTINGS_DIR = join(homedir(), ".devkit");
export const SETTINGS_PATH = join(SETTINGS_DIR, "app-settings.json");

const DEFAULTS: PerAppSettings = {
  autoStart: false,
  autoRestart: true,
};

/**
 * Read settings from disk. Returns null if the file doesn't exist or is corrupt,
 * which signals "legacy mode" (start everything).
 */
export function readSettings(): AppSettings | null {
  if (!existsSync(SETTINGS_PATH)) return null;
  try {
    const raw = readFileSync(SETTINGS_PATH, "utf-8");
    const parsed = JSON.parse(raw) as AppSettings;
    if (parsed.version !== 1 || typeof parsed.apps !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Get settings for a specific app, merging with defaults.
 * If no settings file exists (legacy mode), returns defaults.
 */
export function getAppSettings(appId: string, settings?: AppSettings | null): PerAppSettings {
  const s = settings ?? readSettings();
  if (!s) return DEFAULTS;
  return { ...DEFAULTS, ...s.apps[appId] };
}

/**
 * Ensure the settings directory exists.
 */
export function ensureSettingsDir(): void {
  if (!existsSync(SETTINGS_DIR)) {
    mkdirSync(SETTINGS_DIR, { recursive: true });
  }
}
