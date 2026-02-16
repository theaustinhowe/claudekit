import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabase, runMigrations } from "@devkit/duckdb";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, "db", "migrations");

const DB_PATH = process.env.DATABASE_PATH || "data/b4u.duckdb";

const db = createDatabase({
  dbPath: DB_PATH,
  useGlobalCache: true,
  async onInit(conn) {
    await runMigrations(conn, { migrationsDir: MIGRATIONS_DIR });
  },
});

export const getDb = db.getDb;

// Re-export query helpers so consumers can import from "@/lib/db"
export { execute, queryAll, queryOne } from "@devkit/duckdb";
