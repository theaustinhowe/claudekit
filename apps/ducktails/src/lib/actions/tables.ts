"use server";

import { queryAll, queryOne } from "@claudekit/duckdb";
import { getConnection } from "@/lib/db/connection-manager";
import { getDatabaseEntry } from "@/lib/db/registry";
import type { ColumnInfo, TableSummary } from "@/lib/types";
import { quoteIdentifier, validateIdentifier } from "@/lib/utils";

export async function listTables(databaseId: string): Promise<TableSummary[]> {
  const entry = getDatabaseEntry(databaseId);
  if (!entry) throw new Error(`Unknown database: ${databaseId}`);

  const conn = await getConnection(entry.path);
  const tables = await queryAll<{ table_name: string }>(
    conn,
    "SELECT table_name FROM information_schema.tables WHERE table_schema='main' AND table_type='BASE TABLE' ORDER BY table_name",
  );

  const results: TableSummary[] = [];
  for (const t of tables) {
    if (!validateIdentifier(t.table_name)) continue;
    const count = await queryOne<{ cnt: number }>(
      conn,
      `SELECT COUNT(*)::INTEGER as cnt FROM ${quoteIdentifier(t.table_name)}`,
    );
    results.push({ name: t.table_name, rowCount: count?.cnt ?? 0 });
  }

  return results;
}

export async function getTableSchema(databaseId: string, tableName: string): Promise<ColumnInfo[]> {
  const entry = getDatabaseEntry(databaseId);
  if (!entry) throw new Error(`Unknown database: ${databaseId}`);
  if (!validateIdentifier(tableName)) throw new Error(`Invalid table name: ${tableName}`);

  const conn = await getConnection(entry.path);
  return queryAll<ColumnInfo>(
    conn,
    "SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name=? AND table_schema='main' ORDER BY ordinal_position",
    [tableName],
  );
}

export async function getTableRowCount(databaseId: string, tableName: string): Promise<number> {
  const entry = getDatabaseEntry(databaseId);
  if (!entry) throw new Error(`Unknown database: ${databaseId}`);
  if (!validateIdentifier(tableName)) throw new Error(`Invalid table name: ${tableName}`);

  const conn = await getConnection(entry.path);
  const result = await queryOne<{ cnt: number }>(
    conn,
    `SELECT COUNT(*)::INTEGER as cnt FROM ${quoteIdentifier(tableName)}`,
  );
  return result?.cnt ?? 0;
}

export async function getTablePrimaryKey(databaseId: string, tableName: string): Promise<string[]> {
  const entry = getDatabaseEntry(databaseId);
  if (!entry) throw new Error(`Unknown database: ${databaseId}`);

  const conn = await getConnection(entry.path);

  // Try duckdb_constraints first
  try {
    const result = await queryAll<{ constraint_column_names: string[] }>(
      conn,
      "SELECT constraint_column_names FROM duckdb_constraints() WHERE table_name=? AND constraint_type='PRIMARY KEY'",
      [tableName],
    );
    if (result.length > 0 && result[0].constraint_column_names) {
      const cols = result[0].constraint_column_names;
      if (Array.isArray(cols)) return cols;
      // Sometimes returned as string representation
      if (typeof cols === "string") {
        try {
          return JSON.parse(cols);
        } catch {
          return [cols];
        }
      }
    }
  } catch {
    // fallback below
  }

  return [];
}
