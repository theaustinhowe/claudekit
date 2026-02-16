import fs from "node:fs";
import path from "node:path";
import type { DuckDBConnection } from "@duckdb/node-api";
import { DuckDBInstance } from "@duckdb/node-api";
import { checkpoint, execute } from "./helpers.js";

export interface DatabaseConfig {
  /** Absolute path to the DuckDB file */
  dbPath: string;
  /** Use globalThis caching to survive Next.js HMR (default: true) */
  useGlobalCache?: boolean;
  /** WAL autocheckpoint size (default: "256KB") */
  walAutocheckpoint?: string;
  /** Called after connection is established, before returning. Use for schema init, migrations, etc. */
  onInit?: (conn: DuckDBConnection) => Promise<void>;
}

export interface DatabaseInstance {
  /** Get (or create) the singleton DuckDB connection */
  getDb: () => Promise<DuckDBConnection>;
  /** Checkpoint and close the connection */
  close: () => Promise<void>;
}

/** globalThis cache shape for Next.js HMR survival */
interface GlobalDbCache {
  __duckdb_instance?: DuckDBInstance | null;
  __duckdb_connection?: DuckDBConnection | null;
  __duckdb_initPromise?: Promise<DuckDBConnection> | null;
  __duckdb_shutdownRegistered?: boolean;
}

/**
 * Create a database instance with connection pooling and optional globalThis caching.
 *
 * Merges the best of all three app patterns:
 * - Gadget's globalThis caching for Next.js HMR survival
 * - Gadget's WAL corruption auto-recovery
 * - GoGo's explicit init/close lifecycle
 * - Configurable onInit callback for schema/migration/reconciliation
 */
export function createDatabase(config: DatabaseConfig): DatabaseInstance {
  const { dbPath, useGlobalCache = true, walAutocheckpoint = "256KB", onInit } = config;

  // For globalThis caching (Next.js apps)
  const cache: GlobalDbCache = useGlobalCache ? (globalThis as GlobalDbCache) : {};

  // For non-globalThis caching (Fastify/standalone apps)
  let localConnection: DuckDBConnection | null = null;
  let localInitPromise: Promise<DuckDBConnection> | null = null;

  function getConnection(): DuckDBConnection | null {
    return useGlobalCache ? (cache.__duckdb_connection ?? null) : localConnection;
  }

  function getInitPromise(): Promise<DuckDBConnection> | null {
    return useGlobalCache ? (cache.__duckdb_initPromise ?? null) : localInitPromise;
  }

  async function getDb(): Promise<DuckDBConnection> {
    const existing = getConnection();
    if (existing) return existing;

    const pending = getInitPromise();
    if (pending) return pending;

    const initPromise = (async () => {
      // Ensure directory exists
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });

      let instance: DuckDBInstance;
      try {
        instance = await DuckDBInstance.create(dbPath);
      } catch (err) {
        // DuckDB WAL corruption — remove the WAL file and retry
        const walPath = `${dbPath}.wal`;
        if (fs.existsSync(walPath)) {
          console.warn(`DuckDB failed to open (corrupt WAL?), removing ${walPath} and retrying...`);
          fs.unlinkSync(walPath);
          instance = await DuckDBInstance.create(dbPath);
        } else {
          throw err;
        }
      }

      const conn = await instance.connect();

      // Tune WAL checkpointing
      await execute(conn, `SET wal_autocheckpoint = '${walAutocheckpoint}'`);

      // Store references
      if (useGlobalCache) {
        cache.__duckdb_instance = instance;
        cache.__duckdb_connection = conn;
      } else {
        localConnection = conn;
      }

      // Run app-specific initialization (schema, migrations, reconciliation)
      if (onInit) {
        await onInit(conn);
      }

      return conn;
    })();

    if (useGlobalCache) {
      cache.__duckdb_initPromise = initPromise;
    } else {
      localInitPromise = initPromise;
    }

    // Register shutdown handlers once (globalThis mode only)
    if (useGlobalCache && !cache.__duckdb_shutdownRegistered) {
      cache.__duckdb_shutdownRegistered = true;
      const shutdown = () => {
        if (cache.__duckdb_connection) {
          try {
            cache.__duckdb_connection.closeSync();
          } catch {}
          cache.__duckdb_connection = null;
        }
        cache.__duckdb_instance = null;
        cache.__duckdb_initPromise = null;
      };
      process.on("SIGINT", () => {
        shutdown();
        process.exit(0);
      });
      process.on("SIGTERM", () => {
        shutdown();
        process.exit(0);
      });
      process.on("beforeExit", shutdown);
    }

    return initPromise;
  }

  async function close(): Promise<void> {
    const conn = getConnection();
    if (conn) {
      try {
        await checkpoint(conn);
      } catch {}
      conn.closeSync();
    }

    if (useGlobalCache) {
      cache.__duckdb_connection = null;
      cache.__duckdb_instance = null;
      cache.__duckdb_initPromise = null;
    } else {
      localConnection = null;
      localInitPromise = null;
    }
  }

  return { getDb, close };
}
