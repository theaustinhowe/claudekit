"use server";

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  deduplicateVariables,
  type EnvExampleFile,
  parseEnvExample,
  type SaveEnvResult,
  type SetupWizardData,
} from "@/lib/env-parser";

const ENV_FILES = [
  { label: "Root", appId: "root", example: ".env.example", local: ".env.local" },
  { label: "B4U", appId: "b4u", example: "apps/b4u/.env.example", local: "apps/b4u/.env.local" },
  { label: "Gadget", appId: "gadget", example: "apps/gadget/.env.local.example", local: "apps/gadget/.env.local" },
  { label: "GoGo Web", appId: "gogo-web", example: "apps/gogo-web/.env.example", local: "apps/gogo-web/.env.local" },
  {
    label: "GoGo Orchestrator",
    appId: "gogo-orchestrator",
    example: "apps/gogo-orchestrator/.env.example",
    local: "apps/gogo-orchestrator/.env.local",
  },
];

/** Walk up from cwd looking for pnpm-workspace.yaml to find monorepo root. */
async function findMonorepoRoot(): Promise<string> {
  let dir = process.cwd();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await readFile(join(dir, "pnpm-workspace.yaml"), "utf-8");
      return dir;
    } catch {
      const parent = join(dir, "..");
      if (parent === dir) throw new Error("Could not find monorepo root (pnpm-workspace.yaml)");
      dir = parent;
    }
  }
}

/** Read and parse an existing .env.local file into key-value pairs. */
async function readEnvLocal(path: string): Promise<Record<string, string>> {
  try {
    const content = await readFile(path, "utf-8");
    const result: Record<string, string> = {};
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (key) result[key] = value;
    }
    return result;
  } catch {
    return {};
  }
}

/** Load all .env.example files and existing values for the setup wizard. */
export async function loadSetupData(): Promise<SetupWizardData> {
  const root = await findMonorepoRoot();

  // Parse all .env.example files
  const envFiles: EnvExampleFile[] = [];
  for (const config of ENV_FILES) {
    try {
      const content = await readFile(join(root, config.example), "utf-8");
      const variables = parseEnvExample(content);
      envFiles.push({ appId: config.appId, label: config.label, variables });
    } catch {
      // Skip missing files
    }
  }

  // Deduplicate variables
  const { sharedVariables, appVariables } = deduplicateVariables(envFiles);

  // Read existing .env.local values
  const existingValues: Record<string, string> = {};
  for (const config of ENV_FILES) {
    const values = await readEnvLocal(join(root, config.local));
    for (const [key, value] of Object.entries(values)) {
      // First non-empty value wins (prefer root)
      if (!existingValues[key] && value) {
        existingValues[key] = value;
      }
    }
  }

  return { sharedVariables, appVariables, existingValues };
}

// Track which appIds each variable key belongs to (for save routing)
function buildKeyToApps(): Map<string, string[]> {
  // Hardcoded from ENV_FILES config — matches the .env.example structure
  const map = new Map<string, string[]>();

  // Variables and which apps they appear in (from the .env.example files)
  const mapping: Record<string, string[]> = {
    // Shared (root + others)
    GITHUB_PERSONAL_ACCESS_TOKEN: ["root", "gadget", "gogo-orchestrator"],
    LOG_LEVEL: ["root"],
    DATABASE_PATH: ["root", "gogo-orchestrator"],
    // B4U
    DUCKDB_PATH: ["b4u"],
    // Gadget
    MCP_API_TOKEN: ["gadget"],
    DB_PATH: ["gadget"],
    BRAVE_API_KEY: ["gadget"],
    FIRECRAWL_API_KEY: ["gadget"],
    EXA_API_KEY: ["gadget"],
    TAVILY_API_KEY: ["gadget"],
    NOTION_API_KEY: ["gadget"],
    GOOGLE_MAPS_API_KEY: ["gadget"],
    RESEND_API_KEY: ["gadget"],
    AXIOM_API_TOKEN: ["gadget"],
    RAYGUN_API_KEY: ["gadget"],
    STRIPE_API_KEY: ["gadget"],
    REPLICATE_API_TOKEN: ["gadget"],
    GITLAB_TOKEN: ["gadget"],
    SLACK_BOT_TOKEN: ["gadget"],
    SLACK_TEAM_ID: ["gadget"],
    SENTRY_AUTH_TOKEN: ["gadget"],
    LINEAR_API_KEY: ["gadget"],
    SUPABASE_ACCESS_TOKEN: ["gadget"],
    // GoGo Web
    NEXT_PUBLIC_API_URL: ["gogo-web"],
    NEXT_PUBLIC_WS_URL: ["gogo-web"],
    NEXT_PUBLIC_ORCHESTRATOR_PORT: ["gogo-web"],
    // GoGo Orchestrator
    PORT: ["gogo-orchestrator"],
    ALLOWED_ORIGINS: ["gogo-orchestrator"],
  };

  for (const [key, apps] of Object.entries(mapping)) {
    map.set(key, apps);
  }

  return map;
}

/** Get the .env.local file path for a given appId. */
function getLocalPath(root: string, appId: string): string | null {
  const config = ENV_FILES.find((f) => f.appId === appId);
  return config ? join(root, config.local) : null;
}

/** Update or append key-value pairs in an .env.local file, preserving structure. */
async function updateEnvFile(filePath: string, updates: Record<string, string>): Promise<void> {
  let lines: string[];
  try {
    const content = await readFile(filePath, "utf-8");
    lines = content.split("\n");
  } catch {
    lines = [];
  }

  const remaining = new Set(Object.keys(updates));

  // Update existing lines
  const updatedLines = lines.map((line) => {
    const trimmed = line.trim();
    for (const key of remaining) {
      const value = updates[key];
      // Match active or commented-out versions
      if (trimmed === `${key}=` || trimmed.startsWith(`${key}=`)) {
        remaining.delete(key);
        return value ? `${key}=${value}` : `# ${key}=`;
      }
      if (trimmed === `# ${key}=` || trimmed.startsWith(`# ${key}=`)) {
        remaining.delete(key);
        return value ? `${key}=${value}` : line;
      }
    }
    return line;
  });

  // Append remaining keys
  for (const key of remaining) {
    const value = updates[key];
    updatedLines.push(value ? `${key}=${value}` : `# ${key}=`);
  }

  const output = updatedLines.join("\n").replace(/\n*$/, "\n");
  await writeFile(filePath, output, "utf-8");
}

/** Save wizard values to all relevant .env.local files. */
export async function saveSetupEnv(values: Record<string, string>): Promise<SaveEnvResult> {
  const root = await findMonorepoRoot();
  const keyToApps = buildKeyToApps();
  const filesWritten: string[] = [];
  const errors: string[] = [];

  // Group updates by target file
  const fileUpdates = new Map<string, Record<string, string>>();

  for (const [key, value] of Object.entries(values)) {
    const appIds = keyToApps.get(key);
    if (!appIds) continue;

    for (const appId of appIds) {
      // Root variables don't need to be written to root .env.local unless it's root-only
      // Shared variables get written to each app that uses them
      const filePath = getLocalPath(root, appId);
      if (!filePath) continue;

      const updates = fileUpdates.get(filePath) ?? {};
      updates[key] = value;
      fileUpdates.set(filePath, updates);
    }
  }

  // Write each file
  for (const [filePath, updates] of fileUpdates) {
    try {
      await updateEnvFile(filePath, updates);
      const relative = filePath.replace(`${root}/`, "").replace(root, "");
      filesWritten.push(relative || filePath);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : `Failed to write ${filePath}`);
    }
  }

  return {
    success: errors.length === 0,
    filesWritten: [...new Set(filesWritten)],
    errors,
  };
}
