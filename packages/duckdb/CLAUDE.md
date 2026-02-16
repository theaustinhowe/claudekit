# @devkit/duckdb

Shared DuckDB connection and query helpers for all devkit apps.

## API

### Connection

- `createDatabase(config)` — factory returning `{ getDb, close }`
  - `dbPath`: path to `.duckdb` file
  - `useGlobalCache`: cache on `globalThis` for Next.js HMR survival (default: true)
  - `onInit(conn)`: callback for schema/seed initialization
  - WAL corruption auto-recovery (removes `.wal` and retries)

### Query Helpers

- `queryAll<T>(conn, sql, params?)` — returns `T[]`
- `queryOne<T>(conn, sql, params?)` — returns `T | undefined`
- `execute(conn, sql, params?)` — for INSERT/UPDATE/DELETE
- `checkpoint(conn)` — force WAL checkpoint
- `withTransaction(conn, fn)` — automatic BEGIN/COMMIT/ROLLBACK

All helpers use an async mutex (DuckDB doesn't support concurrent prepared statements on one connection).

### Utilities

- `buildUpdate(table, id, data, jsonFields?, timestampFn?)` — dynamic UPDATE
- `buildInClause(column, values)` — builds `column IN ($1, $2, ...)` with params
- `parseJsonField<T>(value, fallback)` — safe JSON parse for TEXT columns
- `convertRow<T>(row)` — converts DuckDB wrapper types (UUID, Timestamp, BigInt) to JS primitives

### Parameter Binding

Uses `?` placeholders (auto-converted to `$1, $2, ...`). Typed binding: boolean, number (integer/double), string.

## DuckDB Gotchas

- `queryOne<T>()` returns `T | undefined`, not `T | null`
- `INSERT OR IGNORE` → `INSERT INTO ... ON CONFLICT DO NOTHING`
- `INSERT OR REPLACE` → `INSERT INTO ... ON CONFLICT (key) DO UPDATE SET ...`
- `datetime('now')` → `CAST(current_timestamp AS VARCHAR)`
- `GROUP BY` must list ALL non-aggregated columns
- `BOOLEAN` type works natively (no INTEGER 0/1 needed)
