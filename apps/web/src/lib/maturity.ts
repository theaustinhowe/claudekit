import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const SETTINGS_DIR = join(homedir(), ".claudekit");
const MATURITY_PATH = join(SETTINGS_DIR, "maturity.json");

function ensureDir() {
  if (!existsSync(SETTINGS_DIR)) {
    mkdirSync(SETTINGS_DIR, { recursive: true });
  }
}

/** Read maturity percentage overrides from disk. Returns `{}` if missing or corrupt. */
export function readMaturityOverrides(): Record<string, number> {
  if (!existsSync(MATURITY_PATH)) return {};
  try {
    const raw = readFileSync(MATURITY_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    return parsed as Record<string, number>;
  } catch {
    return {};
  }
}

/** Write maturity percentage overrides to disk atomically (temp file + rename). */
export function writeMaturityOverrides(data: Record<string, number>): void {
  ensureDir();
  const tmp = `${MATURITY_PATH}.tmp.${process.pid}`;
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  renameSync(tmp, MATURITY_PATH);
}
