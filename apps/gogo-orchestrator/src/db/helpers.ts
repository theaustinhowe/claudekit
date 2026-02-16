import {
  type DuckDBConnection,
  type DuckDBPreparedStatement,
  DuckDBTimestampTZValue,
  DuckDBUUIDValue,
} from "@duckdb/node-api";

/**
 * Simple async mutex to serialize DuckDB prepared statement execution.
 * DuckDB's node-api doesn't support concurrent prepared statements on a single connection.
 */
let _lock: Promise<void> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = _lock;
  let resolve: () => void;
  _lock = new Promise<void>((r) => {
    resolve = r;
  });
  return prev.then(fn).finally(() => resolve?.());
}

/**
 * Convert `?` placeholders to DuckDB positional `$1, $2, ...` params.
 * Also converts an array of values into a named param object `{ "1": v, "2": v, ... }`.
 */
function convertParams(sql: string, params?: unknown[]): { sql: string; values: Record<string, unknown> } {
  if (!params || params.length === 0) {
    return { sql, values: {} };
  }

  let idx = 0;
  const converted = sql.replace(/\?/g, () => {
    idx++;
    return `$${idx}`;
  });

  const values: Record<string, unknown> = {};
  for (let i = 0; i < params.length; i++) {
    const v = params[i];
    values[String(i + 1)] = v === undefined ? null : v;
  }

  return { sql: converted, values };
}

function bindParams(prepared: DuckDBPreparedStatement, values: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(values)) {
    const idx = Number(key);
    if (value === null) {
      prepared.bindNull(idx);
    } else if (typeof value === "boolean") {
      prepared.bindBoolean(idx, value);
    } else if (typeof value === "number") {
      if (Number.isInteger(value)) {
        prepared.bindInteger(idx, value);
      } else {
        prepared.bindDouble(idx, value);
      }
    } else {
      prepared.bindVarchar(idx, String(value));
    }
  }
}

/**
 * Convert DuckDB-specific value types (UUID, Timestamp, BigInt) to JS primitives.
 * DuckDB's node-api returns these as wrapper objects that don't serialize properly with JSON.stringify.
 */
function convertValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof DuckDBUUIDValue) return value.toString();
  if (value instanceof DuckDBTimestampTZValue) return new Date(Number(value.micros / 1000n)).toISOString();
  if (typeof value === "bigint") return Number(value);
  if (
    typeof value === "object" &&
    value !== null &&
    "toString" in value &&
    value.constructor?.name?.startsWith("DuckDB")
  ) {
    return String(value);
  }
  return value;
}

function convertRow<T>(row: Record<string, unknown>): T {
  const converted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    converted[key] = convertValue(value);
  }
  return converted as T;
}

async function _queryAll<T>(conn: DuckDBConnection, sql: string, params?: unknown[]): Promise<T[]> {
  const { sql: converted, values } = convertParams(sql, params);
  const prepared = await conn.prepare(converted);

  if (params && params.length > 0) {
    bindParams(prepared, values);
  }

  const result = await prepared.run();
  const rows = await result.getRowObjects();
  return rows.map((row) => convertRow<T>(row as Record<string, unknown>));
}

export function queryAll<T>(conn: DuckDBConnection, sql: string, params?: unknown[]): Promise<T[]> {
  return withLock(() => _queryAll<T>(conn, sql, params));
}

export async function queryOne<T>(conn: DuckDBConnection, sql: string, params?: unknown[]): Promise<T | undefined> {
  const rows = await queryAll<T>(conn, sql, params);
  return rows[0];
}

async function _execute(conn: DuckDBConnection, sql: string, params?: unknown[]): Promise<void> {
  const { sql: converted, values } = convertParams(sql, params);
  const prepared = await conn.prepare(converted);

  if (params && params.length > 0) {
    bindParams(prepared, values);
  }

  await prepared.run();
}

export function execute(conn: DuckDBConnection, sql: string, params?: unknown[]): Promise<void> {
  return withLock(() => _execute(conn, sql, params));
}

/**
 * Run a function inside a BEGIN/COMMIT transaction, with automatic ROLLBACK on error.
 */
export async function withTransaction<T>(
  conn: DuckDBConnection,
  fn: (conn: DuckDBConnection) => Promise<T>,
): Promise<T> {
  await execute(conn, "BEGIN TRANSACTION");
  try {
    const result = await fn(conn);
    await execute(conn, "COMMIT");
    return result;
  } catch (err) {
    await execute(conn, "ROLLBACK");
    throw err;
  }
}

/**
 * Parse a JSON column from a DuckDB row.
 * Handles string values (JSON.parse), already-parsed values (passthrough), and missing/null values (returns fallback).
 */
export function parseJsonField<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

/** Validate that a SQL identifier (table/column name) contains only safe characters */
const SAFE_SQL_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function assertSafeIdentifier(name: string, kind: "table" | "column"): void {
  if (!SAFE_SQL_IDENTIFIER.test(name)) {
    throw new Error(`Unsafe SQL ${kind} name: ${name}`);
  }
}

/**
 * Build a dynamic UPDATE statement from a partial data object.
 * Returns null if there are no fields to update.
 * JSON fields are automatically stringified.
 */
export function buildUpdate(
  table: string,
  id: string,
  data: Record<string, unknown>,
  jsonFields?: Set<string>,
): { sql: string; params: unknown[] } | null {
  assertSafeIdentifier(table, "table");

  const sets: string[] = [];
  const params: unknown[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    assertSafeIdentifier(key, "column");
    sets.push(`${key} = ?`);
    params.push(jsonFields?.has(key) ? JSON.stringify(value) : value);
  }

  if (sets.length === 0) return null;

  sets.push("updated_at = ?");
  params.push(new Date().toISOString());
  params.push(id);

  return {
    sql: `UPDATE ${table} SET ${sets.join(", ")} WHERE id = ?`,
    params,
  };
}

/**
 * Build an IN clause with the right number of placeholders.
 * Returns { clause: "col IN (?, ?, ?)", params: [...values] }
 */
export function buildInClause(column: string, values: unknown[]): { clause: string; params: unknown[] } {
  assertSafeIdentifier(column, "column");
  if (values.length === 0) {
    return { clause: "1=0", params: [] };
  }
  const placeholders = values.map(() => "?").join(", ");
  return { clause: `${column} IN (${placeholders})`, params: [...values] };
}
