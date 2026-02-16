import path from "node:path";
import type { DuckDBConnection } from "@duckdb/node-api";
import { DuckDBInstance } from "@duckdb/node-api";
import { execute } from "./helpers.js";
import { runMigrations } from "./migrate.js";

// Database path - use environment variable or default to local file
const dbPath =
  process.env.DATABASE_PATH || path.join(process.cwd(), "data", "gogo.duckdb");

// Singleton instance and connection
let duckdbInstance: DuckDBInstance | null = null;
let duckdbConnection: DuckDBConnection | null = null;

/**
 * Initialize the database connection
 * This must be called before using the database
 */
export async function initializeDatabase(): Promise<void> {
  if (duckdbConnection) {
    return; // Already initialized
  }

  // Ensure the data directory exists
  const dataDir = path.dirname(dbPath);
  const { mkdir } = await import("node:fs/promises");
  await mkdir(dataDir, { recursive: true });

  // Create DuckDB instance and connection
  duckdbInstance = await DuckDBInstance.create(dbPath);
  duckdbConnection = await duckdbInstance.connect();

  // WAL checkpoint tuning
  await execute(duckdbConnection, "SET wal_autocheckpoint = '256KB'");

  // Run numbered migrations from src/db/migrations/
  await runMigrations(duckdbConnection);

  console.log(`[db] Database initialized at ${dbPath}`);
}

/**
 * Get the raw DuckDB connection.
 * Throws if database is not initialized.
 */
export function getConn(): DuckDBConnection {
  if (!duckdbConnection) {
    throw new Error(
      "Database not initialized. Call initializeDatabase() first.",
    );
  }
  return duckdbConnection;
}

/**
 * Close the database connection
 */
export async function closeDatabase(): Promise<void> {
  if (duckdbInstance) {
    // DuckDB instance will be garbage collected, but we clear our references
    duckdbConnection = null;
    duckdbInstance = null;
    console.log("[db] Database connection closed");
  }
}
