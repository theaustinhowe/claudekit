import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DuckDBInstance } from "@duckdb/node-api";
import { runMigrations } from "@devkit/duckdb";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, "migrations");

/**
 * Standalone entry point: connects to the database and runs all pending migrations.
 * Run via `pnpm db:migrate` or `tsx src/db/migrate.ts`.
 */
async function main(): Promise<void> {
  const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "gogo.duckdb");

  const dataDir = path.dirname(dbPath);
  await fs.promises.mkdir(dataDir, { recursive: true });

  console.log(`[migrate] Connecting to database at ${dbPath}`);
  const instance = await DuckDBInstance.create(dbPath);
  const connection = await instance.connect();

  try {
    await runMigrations(connection, { migrationsDir: MIGRATIONS_DIR });
  } finally {
    console.log("[migrate] Done");
  }
}

const isMainModule =
  process.argv[1] && (process.argv[1].endsWith("migrate.ts") || process.argv[1].endsWith("migrate.js"));

if (isMainModule) {
  main().catch((error) => {
    console.error("[migrate] Migration failed:", error);
    process.exit(1);
  });
}
