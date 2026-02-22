import type { Policy } from "@/lib/types";

export { formatElapsed, generateId, nowTimestamp, parseGitHubUrl, timeAgo } from "@claudekit/ui";

export function expandTilde(filepath: string): string {
  if (filepath.startsWith("~/") || filepath === "~") {
    return filepath.replace("~", process.env.HOME || "");
  }
  return filepath;
}

function parseField<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

export function parsePolicy(row: Record<string, unknown>): Policy {
  return {
    ...row,
    expected_versions: parseField(row.expected_versions, {}),
    banned_dependencies: parseField(row.banned_dependencies, []),
    allowed_package_managers: parseField(row.allowed_package_managers, []),
    ignore_patterns: parseField(row.ignore_patterns, []),
    generator_defaults: parseField(row.generator_defaults, {}),
    repo_types: parseField(row.repo_types, []),
  } as Policy;
}

export function formatNumber(n: number): string {
  return n.toLocaleString();
}

async function moveToTrash(filePath: string): Promise<void> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const path = await import("node:path");
  const exec = promisify(execFile);
  // Security: resolve to absolute path and escape for AppleScript to prevent injection
  const resolved = path.resolve(filePath);
  const escaped = resolved.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  await exec("osascript", ["-e", `tell application "Finder" to delete POSIX file "${escaped}"`]);
}

/** Move a directory to Trash (macOS), falling back to recursive rm on failure. */
export async function removeDirectory(dirPath: string): Promise<void> {
  const fs = await import("node:fs");
  if (!fs.existsSync(dirPath)) return;
  try {
    await moveToTrash(dirPath);
  } catch {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}
