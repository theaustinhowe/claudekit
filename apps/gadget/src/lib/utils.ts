import type { Policy } from "@/lib/types";

export { formatElapsed, generateId, nowTimestamp, parseGitHubUrl, timeAgo } from "@claudekit/ui";

export function expandTilde(filepath: string): string {
  if (filepath.startsWith("~/") || filepath === "~") {
    return filepath.replace("~", process.env.HOME || "");
  }
  return filepath;
}

export function parsePolicy(row: Record<string, unknown>): Policy {
  return {
    ...row,
    expected_versions: JSON.parse((row.expected_versions as string) || "{}"),
    banned_dependencies: JSON.parse((row.banned_dependencies as string) || "[]"),
    allowed_package_managers: JSON.parse((row.allowed_package_managers as string) || "[]"),
    ignore_patterns: JSON.parse((row.ignore_patterns as string) || "[]"),
    generator_defaults: JSON.parse((row.generator_defaults as string) || "{}"),
    repo_types: JSON.parse((row.repo_types as string) || "[]"),
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
