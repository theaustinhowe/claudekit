import type { Policy } from "@/lib/types";

export function generateId(): string {
  return crypto.randomUUID();
}

export function nowTimestamp(): string {
  return new Date().toISOString();
}

export function expandTilde(filepath: string): string {
  if (filepath.startsWith("~/") || filepath === "~") {
    return filepath.replace("~", process.env.HOME || "");
  }
  return filepath;
}

export function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const match = url.match(/github\.com[/:]([^/]+)\/([^/.#?]+)/);
  if (!match) return null;
  return { owner: match[1], repo: match[2].replace(/\.git$/, "") };
}

function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
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

export { formatElapsed } from "@devkit/ui";

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

export function timeAgo(date: string | Date): string {
  const now = new Date();
  const then = new Date(date);
  const seconds = Math.floor((now.getTime() - then.getTime()) / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return formatDate(date);
}
