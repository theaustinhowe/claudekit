import { execute, queryAll } from "@devkit/duckdb";
import type { FastifyPluginAsync } from "fastify";
import { getDb } from "../db/index.js";
import { type DbSetting, mapSetting } from "../db/schema.js";

// Global settings only - per-repo settings are in the repositories table
// Mapping: stored key -> { path to extract value, frontend key }
const storedToFrontend: Record<string, { path: string; frontendKey: string }> = {
  github_token: { path: "token", frontendKey: "personalAccessToken" },
  workdir: { path: "path", frontendKey: "workDirectory" },
  max_parallel_jobs: { path: "count", frontendKey: "maxParallelJobs" },
};

// Mapping: frontend key -> { stored key, path to set value }
const frontendToStored: Record<string, { storedKey: string; path: string }> = {
  personalAccessToken: { storedKey: "github_token", path: "token" },
  workDirectory: { storedKey: "workdir", path: "path" },
  maxParallelJobs: { storedKey: "max_parallel_jobs", path: "count" },
};

// Transform stored DB format to frontend format
function transformStoredToFrontend(stored: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [storedKey, mapping] of Object.entries(storedToFrontend)) {
    const storedValue = stored[storedKey] as Record<string, unknown> | undefined;
    if (storedValue !== undefined) {
      result[mapping.frontendKey] = storedValue[mapping.path];
    }
  }

  return result;
}

// Transform frontend format to stored DB format
function transformFrontendToStored(
  frontend: Record<string, unknown>,
  existingStored: Record<string, unknown>,
): Record<string, Record<string, unknown>> {
  const result: Record<string, Record<string, unknown>> = {};

  for (const [frontendKey, value] of Object.entries(frontend)) {
    const mapping = frontendToStored[frontendKey];
    if (!mapping) continue; // Unknown key, skip

    const { storedKey, path } = mapping;

    // Initialize with existing value if available, or empty object
    if (!result[storedKey]) {
      const existing = existingStored[storedKey] as Record<string, unknown> | undefined;
      result[storedKey] = existing ? { ...existing } : {};
    }

    result[storedKey][path] = value;
  }

  return result;
}

export const settingsRouter: FastifyPluginAsync = async (fastify) => {
  // Get all settings - returns frontend format
  fastify.get("/", async () => {
    const conn = await getDb();
    const allSettings = await queryAll<DbSetting>(conn, "SELECT * FROM settings");
    const stored: Record<string, unknown> = {};
    for (const s of allSettings) {
      const mapped = mapSetting(s);
      stored[mapped.key] = mapped.value;
    }
    const frontendData = transformStoredToFrontend(stored);
    return { data: frontendData };
  });

  // Update settings - accepts frontend format, stores in DB format
  fastify.put<{ Body: Record<string, unknown> }>("/", async (request) => {
    const conn = await getDb();

    // Fetch existing settings to merge with
    const allSettings = await queryAll<DbSetting>(conn, "SELECT * FROM settings");
    const existingStored: Record<string, unknown> = {};
    for (const s of allSettings) {
      const mapped = mapSetting(s);
      existingStored[mapped.key] = mapped.value;
    }

    // Transform frontend keys to stored format
    const toStore = transformFrontendToStored(request.body, existingStored);

    // Upsert each stored key
    const now = new Date().toISOString();
    for (const [key, value] of Object.entries(toStore)) {
      await execute(
        conn,
        `INSERT INTO settings (key, value, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT (key) DO UPDATE SET value = ?, updated_at = ?`,
        [key, JSON.stringify(value), now, JSON.stringify(value), now],
      );
    }

    // Return the frontend format that was sent (React Query expects this for cache update)
    return { data: request.body };
  });
};
