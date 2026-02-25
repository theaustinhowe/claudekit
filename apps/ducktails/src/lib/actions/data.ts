"use server";

import { execute, queryAll, queryOne } from "@claudekit/duckdb";
import { getConnection, getWritableConnection } from "@/lib/db/connection-manager";
import { getDatabaseEntry } from "@/lib/db/registry";
import type { ColumnInfo, DataPage } from "@/lib/types";
import { quoteIdentifier, validateIdentifier } from "@/lib/utils";

export async function getTableData(
  databaseId: string,
  tableName: string,
  options: {
    page?: number;
    pageSize?: number;
    sortColumn?: string;
    sortDirection?: "asc" | "desc";
  } = {},
): Promise<DataPage> {
  const entry = getDatabaseEntry(databaseId);
  if (!entry) throw new Error(`Unknown database: ${databaseId}`);
  if (!validateIdentifier(tableName)) throw new Error(`Invalid table name: ${tableName}`);

  const { page = 1, pageSize = 50, sortColumn, sortDirection = "asc" } = options;

  const conn = await getConnection(entry.path);

  // Get columns
  const columns = await queryAll<ColumnInfo>(
    conn,
    "SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name=? AND table_schema='main' ORDER BY ordinal_position",
    [tableName],
  );

  // Get total count
  const countResult = await queryOne<{ cnt: number }>(
    conn,
    `SELECT COUNT(*)::INTEGER as cnt FROM ${quoteIdentifier(tableName)}`,
  );
  const totalRows = countResult?.cnt ?? 0;

  // Build query with optional sorting
  let orderClause = "";
  if (sortColumn && validateIdentifier(sortColumn)) {
    const dir = sortDirection === "desc" ? "DESC" : "ASC";
    orderClause = ` ORDER BY ${quoteIdentifier(sortColumn)} ${dir}`;
  }

  const offset = (page - 1) * pageSize;
  const rows = await queryAll<Record<string, unknown>>(
    conn,
    `SELECT * FROM ${quoteIdentifier(tableName)}${orderClause} LIMIT ? OFFSET ?`,
    [pageSize, offset],
  );

  return {
    columns,
    rows,
    totalRows,
    page,
    pageSize,
    sortColumn,
    sortDirection,
  };
}

async function withWritableConn(
  dbPath: string,
  fn: (conn: import("@duckdb/node-api").DuckDBConnection) => Promise<void>,
): Promise<void> {
  let conn: import("@duckdb/node-api").DuckDBConnection;
  try {
    conn = await getWritableConnection(dbPath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("lock")) {
      throw new Error("Database is locked by the owning app. Stop the app first to make edits.");
    }
    throw err;
  }
  try {
    await fn(conn);
  } finally {
    try {
      conn.closeSync();
    } catch {}
  }
}

export async function insertRow(databaseId: string, tableName: string, data: Record<string, unknown>): Promise<void> {
  const entry = getDatabaseEntry(databaseId);
  if (!entry) throw new Error(`Unknown database: ${databaseId}`);
  if (!validateIdentifier(tableName)) throw new Error(`Invalid table name: ${tableName}`);

  const keys = Object.keys(data).filter((k) => validateIdentifier(k));
  if (keys.length === 0) throw new Error("No valid columns provided");

  const columns = keys.map((k) => quoteIdentifier(k)).join(", ");
  const placeholders = keys.map(() => "?").join(", ");
  const values = keys.map((k) => data[k] ?? null);

  await withWritableConn(entry.path, (conn) =>
    execute(conn, `INSERT INTO ${quoteIdentifier(tableName)} (${columns}) VALUES (${placeholders})`, values),
  );
}

export async function updateRow(
  databaseId: string,
  tableName: string,
  primaryKeys: Record<string, unknown>,
  data: Record<string, unknown>,
): Promise<void> {
  const entry = getDatabaseEntry(databaseId);
  if (!entry) throw new Error(`Unknown database: ${databaseId}`);
  if (!validateIdentifier(tableName)) throw new Error(`Invalid table name: ${tableName}`);

  const setCols = Object.keys(data).filter((k) => validateIdentifier(k));
  if (setCols.length === 0) throw new Error("No valid columns to update");

  const pkCols = Object.keys(primaryKeys).filter((k) => validateIdentifier(k));
  if (pkCols.length === 0) throw new Error("No primary key columns provided");

  const setClause = setCols.map((k) => `${quoteIdentifier(k)} = ?`).join(", ");
  const whereClause = pkCols.map((k) => `${quoteIdentifier(k)} = ?`).join(" AND ");
  const values = [...setCols.map((k) => data[k] ?? null), ...pkCols.map((k) => primaryKeys[k])];

  await withWritableConn(entry.path, (conn) =>
    execute(conn, `UPDATE ${quoteIdentifier(tableName)} SET ${setClause} WHERE ${whereClause}`, values),
  );
}

export async function deleteRow(
  databaseId: string,
  tableName: string,
  primaryKeys: Record<string, unknown>,
): Promise<void> {
  const entry = getDatabaseEntry(databaseId);
  if (!entry) throw new Error(`Unknown database: ${databaseId}`);
  if (!validateIdentifier(tableName)) throw new Error(`Invalid table name: ${tableName}`);

  const pkCols = Object.keys(primaryKeys).filter((k) => validateIdentifier(k));
  if (pkCols.length === 0) throw new Error("No primary key columns provided");

  const whereClause = pkCols.map((k) => `${quoteIdentifier(k)} = ?`).join(" AND ");
  const values = pkCols.map((k) => primaryKeys[k]);

  await withWritableConn(entry.path, (conn) =>
    execute(conn, `DELETE FROM ${quoteIdentifier(tableName)} WHERE ${whereClause}`, values),
  );
}
