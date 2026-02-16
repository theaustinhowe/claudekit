/**
 * Parse a JSON TEXT column from a DuckDB row.
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
 *
 * @param timestampFn - Optional function to generate the updated_at value. Defaults to `() => new Date().toISOString()`.
 */
export function buildUpdate(
  table: string,
  id: string,
  data: Record<string, unknown>,
  jsonFields?: Set<string>,
  timestampFn: () => string = () => new Date().toISOString(),
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
  params.push(timestampFn());
  params.push(id);

  return { sql: `UPDATE ${table} SET ${sets.join(", ")} WHERE id = ?`, params };
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
