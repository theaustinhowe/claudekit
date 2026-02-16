import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabase, runMigrations } from "@devkit/duckdb";
import type { DuckDBConnection } from "@duckdb/node-api";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, "migrations");

// Database path - use environment variable or default to local file
const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "gogo.duckdb");

const db = createDatabase({
  dbPath,
  useGlobalCache: false, // Fastify app, not Next.js
  async onInit(conn) {
    await runMigrations(conn, { migrationsDir: MIGRATIONS_DIR });
    console.log(`[db] Database initialized at ${dbPath}`);
  },
});

/**
 * Get (or create) the DuckDB connection.
 * Preferred async API — use this for new code.
 */
export const getDb = db.getDb;

// Cache the connection after first init for sync access
let cachedConnection: DuckDBConnection | null = null;

/**
 * Initialize the database connection.
 * Must be called at startup before using getConn().
 */
export async function initializeDatabase(): Promise<void> {
  cachedConnection = await db.getDb();
}

/**
 * Get the raw DuckDB connection (sync).
 * Throws if database is not initialized via initializeDatabase().
 * @deprecated Prefer `await getDb()` for new code.
 */
export function getConn(): DuckDBConnection {
  if (!cachedConnection) {
    throw new Error("Database not initialized. Call initializeDatabase() first.");
  }
  return cachedConnection;
}

/**
 * Close the database connection
 */
export async function closeDatabase(): Promise<void> {
  await db.close();
  cachedConnection = null;
  console.log("[db] Database connection closed");
}
