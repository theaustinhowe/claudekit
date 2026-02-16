"use server";

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getDb } from "@/lib/db";
import { queryOne } from "@/lib/db/helpers";

const ENV_PATH = join(process.cwd(), ".env.local");

/** Read and parse .env.local, returning key-value pairs (ignoring comments and blank lines). */
export async function readEnvLocal(): Promise<Record<string, string>> {
  try {
    const content = await readFile(ENV_PATH, "utf-8");
    const result: Record<string, string> = {};
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (key) result[key] = value;
    }
    return result;
  } catch {
    return {};
  }
}

/** Update a single key in .env.local, preserving comments and structure. */
export async function writeEnvKey(key: string, value: string): Promise<{ success: boolean; message: string }> {
  try {
    let lines: string[];
    try {
      const content = await readFile(ENV_PATH, "utf-8");
      lines = content.split("\n");
    } catch {
      lines = [];
    }

    let found = false;
    const updatedLines = lines.map((line) => {
      const trimmed = line.trim();
      // Match both active and commented-out versions of the key
      if (trimmed === `${key}=` || trimmed.startsWith(`${key}=`)) {
        found = true;
        return value ? `${key}=${value}` : `# ${key}=`;
      }
      if (trimmed === `# ${key}=` || trimmed.startsWith(`# ${key}=`)) {
        found = true;
        return value ? `${key}=${value}` : line;
      }
      return line;
    });

    if (!found) {
      updatedLines.push(value ? `${key}=${value}` : `# ${key}=`);
    }

    // Ensure file ends with newline
    const output = updatedLines.join("\n").replace(/\n*$/, "\n");
    await writeFile(ENV_PATH, output, "utf-8");
    return { success: true, message: value ? `${key} saved` : `${key} cleared` };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : "Failed to write .env.local",
    };
  }
}

/** Return just the non-empty key names from .env.local (lightweight check). */
export async function getConfiguredEnvKeyNames(): Promise<string[]> {
  const env = await readEnvLocal();
  return Object.entries(env)
    .filter(([, v]) => v.length > 0)
    .map(([k]) => k);
}

/** Check if a GitHub PAT is available (either in github_accounts table or .env.local). */
export async function hasGitHubPat(): Promise<boolean> {
  // Check .env.local first (fast, no DB)
  const env = await readEnvLocal();
  if (env.GITHUB_PERSONAL_ACCESS_TOKEN?.length > 0) return true;

  // Fall back to github_accounts table
  try {
    const db = await getDb();
    const row = await queryOne<{ cnt: number }>(db, "SELECT COUNT(*) as cnt FROM github_accounts");
    return (row?.cnt ?? 0) > 0;
  } catch {
    return false;
  }
}
