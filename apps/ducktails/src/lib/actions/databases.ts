"use server";

import fs from "node:fs";
import { queryAll } from "@claudekit/duckdb";
import { closeAllConnections, databaseFileExists, getConnection } from "@/lib/db/connection-manager";
import { DATABASE_REGISTRY, getDatabaseEntry as getRegistryEntry } from "@/lib/db/registry";
import type { DatabaseInfo } from "@/lib/types";

export async function listDatabases(): Promise<{ databases: DatabaseInfo[]; refreshedAt: number }> {
  const results: DatabaseInfo[] = [];

  for (const entry of DATABASE_REGISTRY) {
    if (!databaseFileExists(entry.path)) {
      results.push({
        ...entry,
        status: "not_found",
        tableCount: 0,
        fileSize: 0,
      });
      continue;
    }

    try {
      const conn = await getConnection(entry.path);
      const tables = await queryAll<{ table_name: string }>(
        conn,
        "SELECT table_name FROM information_schema.tables WHERE table_schema='main' AND table_type='BASE TABLE'",
      );
      const stat = fs.statSync(entry.path);

      results.push({
        ...entry,
        status: "online",
        tableCount: tables.length,
        fileSize: stat.size,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({
        ...entry,
        status: message.includes("lock") ? "locked" : "error",
        tableCount: 0,
        fileSize: fs.existsSync(entry.path) ? fs.statSync(entry.path).size : 0,
        error: message,
      });
    }
  }

  return { databases: results, refreshedAt: Date.now() };
}

export async function getDatabaseEntry(id: string) {
  return getRegistryEntry(id);
}

/** Invalidate all snapshot caches so the next query gets fresh data. */
export async function refreshSnapshots(): Promise<void> {
  closeAllConnections();
}
