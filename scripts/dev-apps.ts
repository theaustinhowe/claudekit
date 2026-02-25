import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface AppDef {
  id: string;
  filter: string;
  port: number;
}

export const apps: AppDef[] = [
  { id: "web", filter: "web", port: 2000 },
  { id: "gadget", filter: "gadget", port: 2100 },
  { id: "gogo-web", filter: "gogo-web", port: 2200 },
  { id: "gogo-orchestrator", filter: "gogo-orchestrator", port: 2201 },
  { id: "b4u", filter: "b4u", port: 2300 },
  { id: "inspector", filter: "inspector", port: 2400 },
  { id: "inside", filter: "inside", port: 2150 },
  { id: "ducktails", filter: "ducktails", port: 2050 },
  { id: "storybook", filter: "@claudekit/ui", port: 6006 },
];

export const PID_DIR = join(homedir(), ".claudekit", "pids");
export const LOG_DIR = join(homedir(), ".claudekit", "logs");

export function pidFilePath(): string {
  return join(PID_DIR, "dev.pid");
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function readPid(): number | null {
  const pidFile = pidFilePath();
  if (!existsSync(pidFile)) return null;
  try {
    const content = readFileSync(pidFile, "utf-8").trim();
    const pid = Number.parseInt(content, 10);
    return Number.isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}
