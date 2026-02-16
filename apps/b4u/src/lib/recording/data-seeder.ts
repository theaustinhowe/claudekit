import { existsSync } from "node:fs";
import { rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

interface SeedConfig {
  entities: Array<{ name: string; count: number; note: string }>;
  authOverrides: Array<{ id: string; label: string; enabled: boolean }>;
  envItems: Array<{ id: string; label: string; enabled: boolean }>;
}

const backups: string[] = [];

export async function injectEnvOverrides(projectPath: string, config: SeedConfig): Promise<void> {
  // Create a .env.local file with overrides for recording
  const envPath = join(projectPath, ".env.local");
  const backupPath = join(projectPath, ".env.local.b4u-backup");

  // Backup existing .env.local
  if (existsSync(envPath)) {
    await rename(envPath, backupPath);
    backups.push(backupPath);
  }

  // Build env content from enabled items
  const lines: string[] = ["# B4U Recording Overrides (temporary)", "B4U_RECORDING=true"];

  for (const item of config.envItems) {
    if (item.enabled) {
      // Convert label to env var format
      const key = item.id.toUpperCase().replace(/-/g, "_");
      lines.push(`${key}=true`);
    }
  }

  await writeFile(envPath, `${lines.join("\n")}\n`);
}

export async function restoreProject(projectPath: string): Promise<void> {
  // Restore .env.local from backup
  const envPath = join(projectPath, ".env.local");
  const backupPath = join(projectPath, ".env.local.b4u-backup");

  try {
    if (existsSync(backupPath)) {
      await rename(backupPath, envPath);
    } else if (existsSync(envPath)) {
      // Remove the one we created
      await unlink(envPath);
    }
  } catch {
    // Best effort cleanup
  }
}
