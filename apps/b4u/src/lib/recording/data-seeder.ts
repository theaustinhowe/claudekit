import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

interface SeedConfig {
  entities: Array<{ name: string; count: number; note: string }>;
  authOverrides: Array<{ id: string; label: string; enabled: boolean }>;
  envItems: Array<{ id: string; label: string; enabled: boolean }>;
}

type SeedMechanism = "prisma" | "drizzle" | "script" | "none";

const generatedFiles: string[] = [];

/**
 * Detect which seeding mechanism the target project uses.
 */
export function detectSeedMechanism(projectPath: string): { type: SeedMechanism; path: string | null } {
  // Check for Prisma seed
  const prismaTs = join(projectPath, "prisma", "seed.ts");
  const prismaJs = join(projectPath, "prisma", "seed.js");
  if (existsSync(prismaTs)) return { type: "prisma", path: prismaTs };
  if (existsSync(prismaJs)) return { type: "prisma", path: prismaJs };

  // Check for Drizzle seed
  const drizzleTs = join(projectPath, "drizzle", "seed.ts");
  const drizzleJs = join(projectPath, "drizzle", "seed.js");
  if (existsSync(drizzleTs)) return { type: "drizzle", path: drizzleTs };
  if (existsSync(drizzleJs)) return { type: "drizzle", path: drizzleJs };

  // Check for generic seed scripts
  for (const name of ["seed.ts", "seed.js", "seed.mjs"]) {
    const scriptPath = join(projectPath, "scripts", name);
    if (existsSync(scriptPath)) return { type: "script", path: scriptPath };
  }

  return { type: "none", path: null };
}

/**
 * Detect the package manager used by the target project.
 */
function detectPackageManager(projectPath: string): "pnpm" | "yarn" | "npm" | "bun" {
  if (existsSync(join(projectPath, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(projectPath, "bun.lockb")) || existsSync(join(projectPath, "bun.lock"))) return "bun";
  if (existsSync(join(projectPath, "yarn.lock"))) return "yarn";
  return "npm";
}

/**
 * Run the detected seed mechanism for the target project.
 */
export async function runSeedScript(projectPath: string): Promise<void> {
  const { type, path: seedPath } = detectSeedMechanism(projectPath);
  const pm = detectPackageManager(projectPath);

  switch (type) {
    case "prisma":
      await execFileAsync("npx", ["prisma", "db", "seed"], { cwd: projectPath, timeout: 60_000 });
      break;
    case "drizzle":
      if (seedPath) {
        const runner = seedPath.endsWith(".ts") ? "npx tsx" : "node";
        const [cmd, ...args] = runner.split(" ");
        await execFileAsync(cmd, [...args, seedPath], { cwd: projectPath, timeout: 60_000 });
      }
      break;
    case "script":
      if (seedPath) {
        const runner = seedPath.endsWith(".ts") ? "npx tsx" : "node";
        const [cmd, ...args] = runner.split(" ");
        await execFileAsync(cmd, [...args, seedPath], { cwd: projectPath, timeout: 60_000 });
      }
      break;
    case "none":
      // No seed script — skip. The env var injection is enough.
      break;
  }

  // Also try `npm run seed` / `pnpm seed` if it exists in package.json
  if (type === "none") {
    try {
      const pkgPath = join(projectPath, "package.json");
      if (existsSync(pkgPath)) {
        const { readFile } = await import("node:fs/promises");
        const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
        if (pkg.scripts?.seed) {
          await execFileAsync(pm, ["run", "seed"], { cwd: projectPath, timeout: 60_000 });
        }
      }
    } catch {
      // Best effort — ignore if script doesn't exist or fails
    }
  }
}

export async function injectEnvOverrides(projectPath: string, config: SeedConfig): Promise<void> {
  // Create a .env.local file with overrides for recording
  const envPath = join(projectPath, ".env.local");
  const backupPath = join(projectPath, ".env.local.b4u-backup");

  // Backup existing .env.local
  if (existsSync(envPath)) {
    await rename(envPath, backupPath);
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

  // Include mock data entity specs as JSON for seed scripts to consume
  if (config.entities.length > 0) {
    const entityJson = JSON.stringify(config.entities);
    lines.push(`B4U_MOCK_DATA=${entityJson}`);
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

  // Clean up any generated seed files
  for (const f of generatedFiles) {
    try {
      if (existsSync(f)) await unlink(f);
    } catch {
      // Best effort
    }
  }
  generatedFiles.length = 0;
}
