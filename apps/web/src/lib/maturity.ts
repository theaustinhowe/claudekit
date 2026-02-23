import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface MaturityInfo {
  label: string;
  percentage: number;
  color: "green" | "yellow" | "red";
}

export type MaturityData = Record<string, MaturityInfo>;

const SETTINGS_DIR = join(homedir(), ".claudekit");
const MATURITY_PATH = join(SETTINGS_DIR, "maturity.json");

function ensureDir() {
  if (!existsSync(SETTINGS_DIR)) {
    mkdirSync(SETTINGS_DIR, { recursive: true });
  }
}

/**
 * Read persisted maturity overrides from disk.
 * Returns an empty object if the file doesn't exist or is corrupt.
 */
export function readMaturity(): MaturityData {
  if (!existsSync(MATURITY_PATH)) return {};
  try {
    const raw = readFileSync(MATURITY_PATH, "utf-8");
    const parsed = JSON.parse(raw) as MaturityData;
    if (typeof parsed !== "object" || parsed === null) return {};
    return parsed;
  } catch {
    return {};
  }
}

/**
 * Write maturity data to disk atomically (temp file + rename).
 */
export function writeMaturity(data: MaturityData): void {
  ensureDir();
  const tmp = `${MATURITY_PATH}.tmp.${process.pid}`;
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  renameSync(tmp, MATURITY_PATH);
}
