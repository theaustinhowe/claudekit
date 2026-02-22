import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabase, runMigrations } from "@claudekit/duckdb";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, "migrations");

const DB_DIR = path.join(os.homedir(), ".inspector");
const DB_PATH = process.env.DATABASE_PATH || path.join(DB_DIR, "data.duckdb");

const db = createDatabase({
  dbPath: DB_PATH,
  useGlobalCache: true,
  async onInit(conn) {
    await runMigrations(conn, { migrationsDir: MIGRATIONS_DIR });
  },
});

export const getDb = db.getDb;

export { execute, queryAll, queryOne } from "@claudekit/duckdb";
