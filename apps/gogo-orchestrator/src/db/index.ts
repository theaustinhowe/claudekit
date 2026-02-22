import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabase, runMigrations } from "@claudekit/duckdb";

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
 */
export const getDb = db.getDb;

/**
 * Close the database connection
 */
export async function closeDatabase(): Promise<void> {
  await db.close();
  console.log("[db] Database connection closed");
}
