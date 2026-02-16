import fs from "node:fs";
import path from "node:path";
import type { DuckDBConnection } from "@duckdb/node-api";

export interface MigrateOptions {
  /** Absolute path to the directory containing numbered .sql migration files */
  migrationsDir: string;
  /** Optional logger (defaults to console.log). Pass `false` to disable logging. */
  logger?: ((msg: string) => void) | false;
}

interface MigrationFile {
  id: number;
  name: string;
  path: string;
}

/**
 * Execute a single SQL statement, ignoring "already exists" errors for idempotent DDL.
 */
async function execStatement(connection: DuckDBConnection, statement: string): Promise<void> {
  try {
    await connection.run(`${statement};`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("already exists") && !message.includes("Catalog Error")) {
      throw error;
    }
  }
}

/**
 * Execute a SQL file by splitting into individual statements.
 * Lines starting with -- are stripped before execution.
 */
async function execSqlFile(connection: DuckDBConnection, filePath: string): Promise<void> {
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
async function ensureMigrationsTable(connection: DuckDBConnection): Promise<void> {
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
async function getAppliedMigrations(connection: DuckDBConnection): Promise<Set<string>> {
  const result = await connection.run("SELECT name FROM _migrations;");
  const rows = await result.getRows();
  const names = new Set<string>();
  for (const row of rows) {
    names.add(String(row[0]));
  }
  return names;
}

/**
 * Get all migration SQL files from a directory, sorted by filename.
 * Files must be named like `001_description.sql`, `002_description.sql`, etc.
 */
async function getMigrationFiles(dir: string): Promise<MigrationFile[]> {
  if (!fs.existsSync(dir)) return [];

  const files = await fs.promises.readdir(dir);
  return files
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((name) => ({
      name,
      path: path.join(dir, name),
      id: Number.parseInt(name.split("_")[0], 10),
    }));
}

/**
 * Run all pending database migrations from the specified directory.
 *
 * Creates a `_migrations` tracking table if it doesn't exist, reads numbered
 * `.sql` files from `migrationsDir`, and applies any that haven't been recorded yet.
 *
 * Migration files should be named `001_initial.sql`, `002_add_column.sql`, etc.
 * Each file can contain multiple SQL statements separated by `;`.
 *
 * @returns The number of migrations applied
 */
export async function runMigrations(connection: DuckDBConnection, options: MigrateOptions): Promise<number> {
  const log = options.logger === false ? () => {} : (options.logger ?? console.log);

  await ensureMigrationsTable(connection);

  const applied = await getAppliedMigrations(connection);
  const migrations = await getMigrationFiles(options.migrationsDir);

  let appliedCount = 0;

  for (const migration of migrations) {
    if (applied.has(migration.name)) continue;

    log(`[migrate] Applying: ${migration.name}`);
    await execSqlFile(connection, migration.path);
    await connection.run(`INSERT INTO _migrations (id, name) VALUES (${migration.id}, '${migration.name}');`);
    appliedCount++;
  }

  if (appliedCount === 0) {
    log("[migrate] All migrations up to date");
  } else {
    log(`[migrate] Applied ${appliedCount} migration(s)`);
  }

  return appliedCount;
}
