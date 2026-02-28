import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabase, execute, queryOne, runMigrations } from "@claudekit/duckdb";
import { reconcileSessionsOnInit } from "@claudekit/session";
import { nowTimestamp } from "@/lib/utils";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, "migrations");

const DB_DIR = path.join(os.homedir(), ".inside");
const DB_PATH = process.env.DATABASE_PATH || path.join(DB_DIR, "data.duckdb");

const db = createDatabase({
  dbPath: DB_PATH,
  useGlobalCache: true,
  async onInit(conn) {
    // Run numbered migrations
    await runMigrations(conn, { migrationsDir: MIGRATIONS_DIR });

    // Reconcile orphaned sessions + prune old session data
    await reconcileSessionsOnInit((sql, params) => execute(conn, sql, params));

    // Recover orphaned projects stuck in 'scaffolding' after a server restart
    await execute(conn, "UPDATE generator_projects SET status = 'error', updated_at = ? WHERE status = 'scaffolding'", [
      nowTimestamp(),
    ]);

    // Seed built-in data if not yet seeded
    const seeded = await queryOne<{ value: string }>(conn, "SELECT value FROM settings WHERE key = 'seeded_at'");
    if (!seeded) {
      const { seedDatabase } = await import("./seed");
      await seedDatabase(conn);
    }
  },
});

export const getDb = db.getDb;

export { buildUpdate, execute, parseJsonField, queryAll, queryOne } from "@claudekit/duckdb";
