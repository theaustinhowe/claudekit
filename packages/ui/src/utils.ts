import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".bmp",
  ".ico",
  ".webp",
  ".avif",
  ".tiff",
  ".tif",
  ".svg",
]);

export function generateId(): string {
  return crypto.randomUUID();
}

export function nowTimestamp(): string {
  return new Date().toISOString();
}

export function timeAgo(date: string | Date): string {
  const now = new Date();
  const then = new Date(date);
  const seconds = Math.floor((now.getTime() - then.getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(date).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function formatNumber(n: number): string {
  return n.toLocaleString();
}

export function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const match = url.match(/github\.com[/:]([^/]+)\/([^/.#?]+)/);
  if (!match) return null;
  return { owner: match[1], repo: match[2].replace(/\.git$/, "") };
}

export function expandTilde(filepath: string): string {
  if (filepath.startsWith("~/") || filepath === "~") {
    return filepath.replace("~", process.env.HOME || "");
  }
  return filepath;
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
