import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DuckDBConnection } from "@duckdb/node-api";
import { DuckDBInstance } from "@duckdb/node-api";
import { nowTimestamp } from "@/lib/utils";
import { checkpoint, execute } from "./helpers";
import { initSchema } from "./schema";

const DB_DIR = path.join(os.homedir(), ".gadget");
const DB_PATH = process.env.DB_PATH || path.join(DB_DIR, "data.duckdb");

// Cache on globalThis to survive Next.js HMR in dev mode.
// Without this, hot reloads orphan the old DuckDB instance while its WAL
// file is still open, causing WAL replay failures on the next connection.
const globalCache = globalThis as typeof globalThis & {
  __duckdb_instance?: DuckDBInstance | null;
  __duckdb_connection?: DuckDBConnection | null;
  __duckdb_initPromise?: Promise<DuckDBConnection> | null;
  __duckdb_shutdownRegistered?: boolean;
};

export async function getDb(): Promise<DuckDBConnection> {
  if (globalCache.__duckdb_connection) return globalCache.__duckdb_connection;
  if (globalCache.__duckdb_initPromise) return globalCache.__duckdb_initPromise;

  globalCache.__duckdb_initPromise = (async () => {
    // Ensure directory exists
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

    try {
      globalCache.__duckdb_instance = await DuckDBInstance.create(DB_PATH);
    } catch (err) {
      // DuckDB WAL corruption — remove the WAL file and retry
      const walPath = `${DB_PATH}.wal`;
      if (fs.existsSync(walPath)) {
        console.warn(`DuckDB failed to open (corrupt WAL?), removing ${walPath} and retrying...`);
        fs.unlinkSync(walPath);
        globalCache.__duckdb_instance = await DuckDBInstance.create(DB_PATH);
      } else {
        throw err;
      }
    }
    globalCache.__duckdb_connection = await globalCache.__duckdb_instance.connect();

    // Flush WAL more frequently (default 16MB is too high for a local tool)
    await execute(globalCache.__duckdb_connection, "SET wal_autocheckpoint = '256KB'");

    // Initialize schema
    await initSchema(globalCache.__duckdb_connection);

    // Reconcile orphaned scans left in 'running' state from crashed processes
    await execute(
      globalCache.__duckdb_connection,
      "UPDATE scans SET status = 'error', completed_at = ? WHERE status = 'running'",
      [nowTimestamp()],
    );

    // Reconcile orphaned sessions left in 'running' or 'pending' state
    await execute(
      globalCache.__duckdb_connection,
      "UPDATE sessions SET status = 'error', error_message = 'Process terminated unexpectedly', completed_at = ? WHERE status IN ('running', 'pending')",
      [nowTimestamp()],
    );

    // Prune old session logs (older than 7 days)
    const logCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    await execute(globalCache.__duckdb_connection, "DELETE FROM session_logs WHERE created_at < ?", [logCutoff]);

    // Prune old completed sessions (older than 30 days)
    const sessionCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    await execute(
      globalCache.__duckdb_connection,
      "DELETE FROM sessions WHERE created_at < ? AND status NOT IN ('running', 'pending')",
      [sessionCutoff],
    );

    return globalCache.__duckdb_connection;
  })();

  // Register shutdown handlers once to cleanly close the connection
  if (!globalCache.__duckdb_shutdownRegistered) {
    globalCache.__duckdb_shutdownRegistered = true;
    const shutdown = () => {
      if (globalCache.__duckdb_connection) {
        try {
          globalCache.__duckdb_connection.closeSync();
        } catch {}
        globalCache.__duckdb_connection = null;
      }
      globalCache.__duckdb_instance = null;
      globalCache.__duckdb_initPromise = null;
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

  return globalCache.__duckdb_initPromise;
}

async function _closeDb(): Promise<void> {
  if (globalCache.__duckdb_connection) {
    try {
      await checkpoint(globalCache.__duckdb_connection);
    } catch {}
    globalCache.__duckdb_connection.closeSync();
    globalCache.__duckdb_connection = null;
  }
  globalCache.__duckdb_instance = null;
  globalCache.__duckdb_initPromise = null;
}
