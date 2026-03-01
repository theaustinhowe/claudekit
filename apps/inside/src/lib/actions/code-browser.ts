"use server";

import { execFile } from "node:child_process";
import os from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function resolvePath(p: string): string {
  return p.startsWith("~/") ? p.replace("~", os.homedir()) : p;
}

export async function openFolderInFinder(dirPath: string): Promise<void> {
  await execFileAsync("open", [resolvePath(dirPath)]);
}

export async function openFolderInTerminal(dirPath: string): Promise<void> {
  await execFileAsync("open", ["-a", "Terminal", resolvePath(dirPath)]);
}
