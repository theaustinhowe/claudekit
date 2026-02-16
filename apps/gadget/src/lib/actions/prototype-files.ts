"use server";

import fs from "node:fs";
import path from "node:path";
import { IMAGE_EXTENSIONS } from "@/lib/constants";
import { detectLanguage, isBinaryFile } from "@/lib/services/language-detector";
import type { CodeFileContent, CodeTreeEntry } from "@/lib/types";
import { expandTilde } from "@/lib/utils";

/**
 * Get the project root directory path.
 */
function getProjectRootPath(projectPath: string, projectName: string): string {
  return path.join(expandTilde(projectPath), projectName);
}

/**
 * Read the project root directory tree.
 */
export async function getProjectTree(projectPath: string, projectName: string, subPath = ""): Promise<CodeTreeEntry[]> {
  const rootPath = getProjectRootPath(projectPath, projectName);
  const dirPath = subPath ? path.join(rootPath, subPath) : rootPath;
  const resolvedDir = path.resolve(dirPath);
  if (!resolvedDir.startsWith(rootPath)) return [];

  if (!fs.existsSync(dirPath)) return [];

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  return entries
    .filter((e) => !e.name.startsWith(".") && e.name !== "node_modules")
    .sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    })
    .map((e) => ({
      name: e.name,
      type: e.isDirectory() ? ("directory" as const) : ("file" as const),
      path: subPath ? `${subPath}/${e.name}` : e.name,
    }));
}

/**
 * Read a file from the project root directory.
 */
export async function getProjectFileContent(
  projectPath: string,
  projectName: string,
  filePath: string,
): Promise<CodeFileContent | null> {
  const rootPath = getProjectRootPath(projectPath, projectName);
  const fullPath = path.resolve(rootPath, filePath);
  if (!fullPath.startsWith(rootPath)) return null;

  if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) return null;

  // Binary files: return metadata only (images served via raw API route)
  if (isBinaryFile(filePath)) {
    const stats = fs.statSync(fullPath);
    const ext = path.extname(filePath).toLowerCase();
    const isImage = IMAGE_EXTENSIONS.has(ext);
    return { path: filePath, content: "", language: isImage ? "image" : "binary", size: stats.size, isBinary: true };
  }

  // File size limit (1MB max, truncate at 512KB)
  const stats = fs.statSync(fullPath);
  const MAX_FILE_SIZE = 1024 * 1024;
  const TRUNCATE_SIZE = 512 * 1024;
  let content: string;
  if (stats.size > MAX_FILE_SIZE) {
    const buffer = Buffer.alloc(TRUNCATE_SIZE);
    const fd = fs.openSync(fullPath, "r");
    fs.readSync(fd, buffer, 0, TRUNCATE_SIZE, 0);
    fs.closeSync(fd);
    content = buffer.toString("utf-8");
  } else {
    content = fs.readFileSync(fullPath, "utf-8");
  }

  return {
    path: filePath,
    content,
    language: detectLanguage(filePath),
    size: stats.size,
    isBinary: false,
  };
}
