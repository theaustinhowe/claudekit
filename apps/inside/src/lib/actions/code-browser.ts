"use server";

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function openFolderInFinder(dirPath: string): Promise<void> {
  await execFileAsync("open", [dirPath]);
}
