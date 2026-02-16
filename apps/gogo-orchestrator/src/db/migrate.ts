import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { DuckDBConnection } from "@duckdb/node-api";
import { DuckDBInstance } from "@duckdb/node-api";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, "migrations");

/**
 * Execute a single SQL statement on the connection, ignoring "already exists" errors
 * for idempotent DDL statements.
 */
async function execStatement(
  connection: DuckDBConnection,
  statement: string,
): Promise<void> {
  try {
    await connection.run(`${statement};`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      !message.includes("already exists") &&
      !message.includes("Catalog Error")
    ) {
      throw error;
    }
  }
}

/**
 * Execute a SQL file by splitting it into individual statements and running each one.
 * Comments (lines starting with --) are stripped before execution.
 */
async function execSqlFile(
  connection: DuckDBConnection,
  filePath: string,
): Promise<void> {
  const sql = await fs.promises.readFile(filePath, "utf-8");

  const sqlWithoutComments = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  const statements = sqlWithoutComments
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const statement of statements) {
    await execStatement(connection, statement);
  }
}

/**
 * Ensure the _migrations tracking table exists.
 */
async function ensureMigrationsTable(
  connection: DuckDBConnection,
): Promise<void> {
  await connection.run(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY,
      name VARCHAR NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

/**
 * Get the set of migration names that have already been applied.
 */
async function getAppliedMigrations(
  connection: DuckDBConnection,
): Promise<Set<string>> {
  const result = await connection.run("SELECT name FROM _migrations;");
  const rows = await result.getRows();
  const names = new Set<string>();
  for (const row of rows) {
    const name = String(row[0]);
    names.add(name);
  }
  return names;
}

/**
 * Get all migration SQL files from the migrations directory, sorted by filename.
 */
async function getMigrationFiles(): Promise<
  { name: string; path: string; id: number }[]
> {
  const files = await fs.promises.readdir(MIGRATIONS_DIR);
  return files
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((name) => ({
      name,
      path: path.join(MIGRATIONS_DIR, name),
      id: Number.parseInt(name.split("_")[0], 10),
    }));
}

/**
 * Run all pending database migrations.
 *
 * Creates the _migrations tracking table if it does not exist, reads SQL files
 * from the migrations directory, and applies any that have not yet been recorded.
 * Each migration is recorded in _migrations after successful execution.
 *
 * Can be called programmatically or run standalone via `tsx src/db/migrate.ts`.
 */
export async function runMigrations(
  connection: DuckDBConnection,
): Promise<void> {
  await ensureMigrationsTable(connection);

  const applied = await getAppliedMigrations(connection);
  const migrations = await getMigrationFiles();

  let appliedCount = 0;

  for (const migration of migrations) {
    if (applied.has(migration.name)) {
      continue;
    }

    console.log(`[migrate] Applying migration: ${migration.name}`);
    await execSqlFile(connection, migration.path);

    await connection.run(
      `INSERT INTO _migrations (id, name) VALUES (${migration.id}, '${migration.name}');`,
    );

    appliedCount++;
    console.log(`[migrate] Applied: ${migration.name}`);
  }

  if (appliedCount === 0) {
    console.log("[migrate] All migrations are up to date");
  } else {
    console.log(`[migrate] Applied ${appliedCount} migration(s)`);
  }
}

/**
 * Standalone entry point: connects to the database and runs all pending migrations.
 */
async function main(): Promise<void> {
  const dbPath =
    process.env.DATABASE_PATH ||
    path.join(process.cwd(), "data", "gogo.duckdb");

  // Ensure the data directory exists
  const dataDir = path.dirname(dbPath);
  await fs.promises.mkdir(dataDir, { recursive: true });

  console.log(`[migrate] Connecting to database at ${dbPath}`);
  const instance = await DuckDBInstance.create(dbPath);
  const connection = await instance.connect();

  try {
    await runMigrations(connection);
  } finally {
    // DuckDB cleans up on GC, but we log completion
    console.log("[migrate] Done");
  }
}

// Run standalone when executed directly
const isMainModule =
  process.argv[1] &&
  (process.argv[1].endsWith("migrate.ts") ||
    process.argv[1].endsWith("migrate.js"));

if (isMainModule) {
  main().catch((error) => {
    console.error("[migrate] Migration failed:", error);
    process.exit(1);
  });
}
