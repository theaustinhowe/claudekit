import { type DuckDBConnection, DuckDBInstance } from "@duckdb/node-api";

const DB_PATH = process.env.DUCKDB_PATH || "data/b4u.duckdb";

// Cache on globalThis to survive Next.js HMR — prevents duplicate
// DuckDBInstance objects fighting over the same file lock.
const globalForDb = globalThis as typeof globalThis & {
  __duckdb_instance?: Promise<DuckDBInstance>;
  __duckdb_write_queue?: Promise<unknown>;
};

function getInstance(): Promise<DuckDBInstance> {
  if (!globalForDb.__duckdb_instance) {
    globalForDb.__duckdb_instance = DuckDBInstance.create(DB_PATH);
  }
  return globalForDb.__duckdb_instance;
}

/**
 * Serialize all write operations through a queue.
 * DuckDB only allows one concurrent writer — overlapping writes from
 * different connections cause "TransactionContext Error: Conflict on update!".
 */
function serializedWrite<T>(fn: () => Promise<T>): Promise<T> {
  const prev = globalForDb.__duckdb_write_queue ?? Promise.resolve();
  const next = prev.then(fn, fn); // run even if previous failed
  globalForDb.__duckdb_write_queue = next.catch(() => {}); // swallow to keep chain going
  return next;
}

async function getConnection(): Promise<DuckDBConnection> {
  const instance = await getInstance();
  return instance.connect();
}

export async function query<T extends Record<string, unknown>>(sql: string): Promise<T[]> {
  const conn = await getConnection();
  try {
    const reader = await conn.runAndReadAll(sql);
    return reader.getRowObjectsJson() as T[];
  } finally {
    conn.closeSync();
  }
}

export async function execute(sql: string): Promise<void> {
  return serializedWrite(async () => {
    const conn = await getConnection();
    try {
      await conn.run(sql);
    } finally {
      conn.closeSync();
    }
  });
}

export async function executePrepared(
  sql: string,
  params: Record<string, string | number | boolean | null>,
): Promise<void> {
  return serializedWrite(async () => {
    const conn = await getConnection();
    try {
      const stmt = await conn.prepare(sql);
      for (const [name, value] of Object.entries(params)) {
        const idx = stmt.parameterIndex(name);
        if (value === null) {
          stmt.bindNull(idx);
        } else if (typeof value === "string") {
          stmt.bindVarchar(idx, value);
        } else if (typeof value === "boolean") {
          stmt.bindBoolean(idx, value);
        } else if (typeof value === "number") {
          if (Number.isInteger(value)) {
            stmt.bindInteger(idx, value);
          } else {
            stmt.bindDouble(idx, value);
          }
        }
      }
      await stmt.run();
    } finally {
      conn.closeSync();
    }
  });
}

async function closeDatabase(): Promise<void> {
  if (globalForDb.__duckdb_instance) {
    const instance = await globalForDb.__duckdb_instance;
    instance.closeSync();
    globalForDb.__duckdb_instance = undefined;
  }
}
