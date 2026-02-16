import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabase, execute, queryOne, runMigrations } from "@devkit/duckdb";
import { nowTimestamp } from "@/lib/utils";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, "migrations");

const DB_DIR = path.join(os.homedir(), ".gadget");
const DB_PATH = process.env.DATABASE_PATH || path.join(DB_DIR, "data.duckdb");

const db = createDatabase({
  dbPath: DB_PATH,
  useGlobalCache: true,
  async onInit(conn) {
    // Run numbered migrations
    await runMigrations(conn, { migrationsDir: MIGRATIONS_DIR });

    // Reconcile orphaned scans left in 'running' state from crashed processes
    await execute(conn, "UPDATE scans SET status = 'error', completed_at = ? WHERE status = 'running'", [
      nowTimestamp(),
    ]);

    // Reconcile orphaned sessions left in 'running' or 'pending' state
    await execute(
      conn,
      "UPDATE sessions SET status = 'error', error_message = 'Process terminated unexpectedly', completed_at = ? WHERE status IN ('running', 'pending')",
      [nowTimestamp()],
    );

    // Prune old session logs (older than 7 days)
    const logCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    await execute(conn, "DELETE FROM session_logs WHERE created_at < ?", [logCutoff]);

    // Prune old completed sessions (older than 30 days)
    const sessionCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    await execute(conn, "DELETE FROM sessions WHERE created_at < ? AND status NOT IN ('running', 'pending')", [
      sessionCutoff,
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

// Re-export query helpers so consumers can import from "@/lib/db"
export { buildUpdate, checkpoint, execute, parseJsonField, queryAll, queryOne, withTransaction } from "@devkit/duckdb";
