"use server";

import { queryAll } from "@claudekit/duckdb";
import { getConnection } from "@/lib/db/connection-manager";
import { getDatabaseEntry } from "@/lib/db/registry";
import type { QueryResult } from "@/lib/types";

export async function executeQuery(databaseId: string, sql: string): Promise<QueryResult> {
  const entry = getDatabaseEntry(databaseId);
  if (!entry) throw new Error(`Unknown database: ${databaseId}`);

  const trimmed = sql.trim();
  if (!trimmed) {
    return { columns: [], rows: [], rowCount: 0, executionTimeMs: 0, error: "Empty query" };
  }

  const conn = await getConnection(entry.path);

  const start = performance.now();
  try {
    const rows = await queryAll<Record<string, unknown>>(conn, trimmed);
    const executionTimeMs = Math.round(performance.now() - start);

    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

    return {
      columns,
      rows,
      rowCount: rows.length,
      executionTimeMs,
    };
  } catch (err) {
    const executionTimeMs = Math.round(performance.now() - start);
    return {
      columns: [],
      rows: [],
      rowCount: 0,
      executionTimeMs,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
