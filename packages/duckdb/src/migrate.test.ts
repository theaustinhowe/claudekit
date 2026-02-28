import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock node:fs before imports
vi.mock("node:fs", () => {
  return {
    default: {
      existsSync: vi.fn(),
      promises: {
        readdir: vi.fn(),
        readFile: vi.fn(),
      },
    },
  };
});

import fs from "node:fs";
import type { DuckDBConnection } from "@duckdb/node-api";
import { runMigrations } from "./migrate.js";

/** Helper to create a typed mock of DuckDBConnection with only the methods tests need */
function mockConnection(overrides: Partial<Record<keyof DuckDBConnection, unknown>>): DuckDBConnection {
  return overrides as DuckDBConnection;
}

/** Create a mock DuckDB connection for migration tests */
function createMockConnection() {
  const runResult = {
    getRows: vi.fn().mockResolvedValue([]),
  };

  return Object.assign(
    mockConnection({
      run: vi.fn().mockResolvedValue(runResult),
    }),
    { _runResult: runResult },
  );
}

describe("runMigrations", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("creates the _migrations tracking table", async () => {
    const conn = createMockConnection();
    vi.mocked(fs.existsSync).mockReturnValue(false);

    await runMigrations(conn, {
      migrationsDir: "/app/migrations",
      logger: false,
    });

    // First call should create the _migrations table
    expect(conn.run).toHaveBeenCalledWith(expect.stringContaining("CREATE TABLE IF NOT EXISTS _migrations"));
  });

  it("applies pending migrations in order", async () => {
    const conn = createMockConnection();
    const runCalls: string[] = [];

    // Track all run() calls
    (conn.run as ReturnType<typeof vi.fn>).mockImplementation((sql: string) => {
      runCalls.push(sql.trim());
      return Promise.resolve({
        getRows: vi.fn().mockResolvedValue([]),
      });
    });

    vi.mocked(fs.existsSync).mockReturnValue(true);
    // biome-ignore lint/suspicious/noExplicitAny: test mock for fs.readdir overloads
    vi.mocked(fs.promises.readdir).mockResolvedValue(["001_initial.sql", "002_add_index.sql"] as any);
    // biome-ignore lint/suspicious/noExplicitAny: test mock for fs.readFile overloads
    vi.mocked(fs.promises.readFile).mockImplementation(async (filePath: any) => {
      if (String(filePath).includes("001_initial.sql")) {
        return "CREATE TABLE jobs (id VARCHAR PRIMARY KEY)";
      }
      if (String(filePath).includes("002_add_index.sql")) {
        return "CREATE INDEX idx_jobs ON jobs (id)";
      }
      return "";
    });

    const count = await runMigrations(conn, {
      migrationsDir: "/app/migrations",
      logger: false,
    });

    expect(count).toBe(2);
    // Should have INSERT INTO _migrations for each applied migration
    const insertCalls = runCalls.filter((c) => c.startsWith("INSERT INTO _migrations"));
    expect(insertCalls).toHaveLength(2);
    expect(insertCalls[0]).toContain("001_initial.sql");
    expect(insertCalls[1]).toContain("002_add_index.sql");
  });

  it("skips already applied migrations", async () => {
    const conn = createMockConnection();
    const runCalls: string[] = [];

    (conn.run as ReturnType<typeof vi.fn>).mockImplementation((sql: string) => {
      runCalls.push(sql.trim());
      const rows =
        sql.trim() === "SELECT name FROM _migrations;"
          ? [["001_initial.sql"]] // Migration 001 already applied
          : [];
      return Promise.resolve({
        getRows: vi.fn().mockResolvedValue(rows),
      });
    });

    vi.mocked(fs.existsSync).mockReturnValue(true);
    // biome-ignore lint/suspicious/noExplicitAny: test mock for fs.readdir overloads
    vi.mocked(fs.promises.readdir).mockResolvedValue(["001_initial.sql", "002_add_index.sql"] as any);
    vi.mocked(fs.promises.readFile).mockResolvedValue("CREATE TABLE something (id VARCHAR)");

    const count = await runMigrations(conn, {
      migrationsDir: "/app/migrations",
      logger: false,
    });

    expect(count).toBe(1);
    // Only migration 002 should be inserted
    const insertCalls = runCalls.filter((c) => c.startsWith("INSERT INTO _migrations"));
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]).toContain("002_add_index.sql");
  });

  it("splits multi-statement SQL files", async () => {
    const conn = createMockConnection();
    const runCalls: string[] = [];

    (conn.run as ReturnType<typeof vi.fn>).mockImplementation((sql: string) => {
      runCalls.push(sql.trim());
      return Promise.resolve({
        getRows: vi.fn().mockResolvedValue([]),
      });
    });

    vi.mocked(fs.existsSync).mockReturnValue(true);
    // biome-ignore lint/suspicious/noExplicitAny: test mock for fs.readdir overloads
    vi.mocked(fs.promises.readdir).mockResolvedValue(["001_multi.sql"] as any);
    vi.mocked(fs.promises.readFile).mockResolvedValue(
      "CREATE TABLE a (id VARCHAR);\nCREATE TABLE b (id VARCHAR);\nCREATE INDEX idx ON a (id)",
    );

    await runMigrations(conn, {
      migrationsDir: "/app/migrations",
      logger: false,
    });

    // Each statement should be executed separately (with ; appended by execStatement)
    const statementCalls = runCalls.filter(
      (c) => c.includes("CREATE TABLE a") || c.includes("CREATE TABLE b") || c.includes("CREATE INDEX"),
    );
    expect(statementCalls).toHaveLength(3);
  });

  it("ignores 'already exists' errors in DDL", async () => {
    const conn = createMockConnection();

    let _callCount = 0;
    (conn.run as ReturnType<typeof vi.fn>).mockImplementation((sql: string) => {
      _callCount++;
      // Simulate "already exists" error on the actual DDL statement execution
      if (sql.includes("CREATE TABLE jobs")) {
        throw new Error("Table 'jobs' already exists");
      }
      return Promise.resolve({
        getRows: vi.fn().mockResolvedValue([]),
      });
    });

    vi.mocked(fs.existsSync).mockReturnValue(true);
    // biome-ignore lint/suspicious/noExplicitAny: test mock for fs.readdir overloads
    vi.mocked(fs.promises.readdir).mockResolvedValue(["001_initial.sql"] as any);
    vi.mocked(fs.promises.readFile).mockResolvedValue("CREATE TABLE jobs (id VARCHAR PRIMARY KEY)");

    // Should not throw despite the "already exists" error
    const count = await runMigrations(conn, {
      migrationsDir: "/app/migrations",
      logger: false,
    });

    expect(count).toBe(1);
  });

  it("ignores Catalog Error in DDL", async () => {
    const conn = createMockConnection();

    (conn.run as ReturnType<typeof vi.fn>).mockImplementation((sql: string) => {
      if (sql.includes("CREATE INDEX")) {
        throw new Error("Catalog Error: index already exists");
      }
      return Promise.resolve({
        getRows: vi.fn().mockResolvedValue([]),
      });
    });

    vi.mocked(fs.existsSync).mockReturnValue(true);
    // biome-ignore lint/suspicious/noExplicitAny: test mock for fs.readdir overloads
    vi.mocked(fs.promises.readdir).mockResolvedValue(["001_idx.sql"] as any);
    vi.mocked(fs.promises.readFile).mockResolvedValue("CREATE INDEX idx ON jobs (id)");

    // Should not throw
    await expect(
      runMigrations(conn, {
        migrationsDir: "/app/migrations",
        logger: false,
      }),
    ).resolves.toBe(1);
  });

  it("rethrows non-DDL errors", async () => {
    const conn = createMockConnection();

    (conn.run as ReturnType<typeof vi.fn>).mockImplementation((sql: string) => {
      if (sql.includes("INSERT INTO broken")) {
        throw new Error("Syntax error near 'INSERT'");
      }
      return Promise.resolve({
        getRows: vi.fn().mockResolvedValue([]),
      });
    });

    vi.mocked(fs.existsSync).mockReturnValue(true);
    // biome-ignore lint/suspicious/noExplicitAny: test mock for fs.readdir overloads
    vi.mocked(fs.promises.readdir).mockResolvedValue(["001_broken.sql"] as any);
    vi.mocked(fs.promises.readFile).mockResolvedValue("INSERT INTO broken VALUES");

    await expect(
      runMigrations(conn, {
        migrationsDir: "/app/migrations",
        logger: false,
      }),
    ).rejects.toThrow("Syntax error");
  });

  it("returns 0 when migrations directory does not exist", async () => {
    const conn = createMockConnection();
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const count = await runMigrations(conn, {
      migrationsDir: "/nonexistent/migrations",
      logger: false,
    });

    expect(count).toBe(0);
  });

  it("returns 0 when all migrations are already applied", async () => {
    const conn = createMockConnection();

    (conn.run as ReturnType<typeof vi.fn>).mockImplementation((sql: string) => {
      const rows = sql.trim() === "SELECT name FROM _migrations;" ? [["001_initial.sql"]] : [];
      return Promise.resolve({
        getRows: vi.fn().mockResolvedValue(rows),
      });
    });

    vi.mocked(fs.existsSync).mockReturnValue(true);
    // biome-ignore lint/suspicious/noExplicitAny: test mock for fs.readdir overloads
    vi.mocked(fs.promises.readdir).mockResolvedValue(["001_initial.sql"] as any);

    const count = await runMigrations(conn, {
      migrationsDir: "/app/migrations",
      logger: false,
    });

    expect(count).toBe(0);
  });

  it("strips comment lines before executing SQL", async () => {
    const conn = createMockConnection();
    const runCalls: string[] = [];

    (conn.run as ReturnType<typeof vi.fn>).mockImplementation((sql: string) => {
      runCalls.push(sql);
      return Promise.resolve({
        getRows: vi.fn().mockResolvedValue([]),
      });
    });

    vi.mocked(fs.existsSync).mockReturnValue(true);
    // biome-ignore lint/suspicious/noExplicitAny: test mock for fs.readdir overloads
    vi.mocked(fs.promises.readdir).mockResolvedValue(["001_comments.sql"] as any);
    vi.mocked(fs.promises.readFile).mockResolvedValue(
      "-- This is a comment\nCREATE TABLE jobs (id VARCHAR);\n-- Another comment\nCREATE INDEX idx ON jobs (id)",
    );

    await runMigrations(conn, {
      migrationsDir: "/app/migrations",
      logger: false,
    });

    // The executed statements should not contain comment lines
    const ddlCalls = runCalls.filter((c) => c.includes("CREATE"));
    for (const call of ddlCalls) {
      expect(call).not.toContain("-- This is a comment");
      expect(call).not.toContain("-- Another comment");
    }
  });

  it("uses custom logger when provided", async () => {
    const conn = createMockConnection();
    const logMessages: string[] = [];
    const logger = (msg: string) => logMessages.push(msg);

    vi.mocked(fs.existsSync).mockReturnValue(true);
    // biome-ignore lint/suspicious/noExplicitAny: test mock for fs.readdir overloads
    vi.mocked(fs.promises.readdir).mockResolvedValue(["001_initial.sql"] as any);
    vi.mocked(fs.promises.readFile).mockResolvedValue("CREATE TABLE jobs (id VARCHAR)");

    (conn.run as ReturnType<typeof vi.fn>).mockImplementation(() => {
      return Promise.resolve({
        getRows: vi.fn().mockResolvedValue([]),
      });
    });

    await runMigrations(conn, {
      migrationsDir: "/app/migrations",
      logger,
    });

    expect(logMessages.some((m) => m.includes("Applying: 001_initial.sql"))).toBe(true);
    expect(logMessages.some((m) => m.includes("Applied 1 migration"))).toBe(true);
  });

  it("logs 'up to date' when no migrations to apply", async () => {
    const conn = createMockConnection();
    const logMessages: string[] = [];
    const logger = (msg: string) => logMessages.push(msg);

    vi.mocked(fs.existsSync).mockReturnValue(false);

    await runMigrations(conn, {
      migrationsDir: "/app/migrations",
      logger,
    });

    expect(logMessages.some((m) => m.includes("up to date"))).toBe(true);
  });

  it("only processes .sql files from the directory", async () => {
    const conn = createMockConnection();

    (conn.run as ReturnType<typeof vi.fn>).mockImplementation(() => {
      return Promise.resolve({
        getRows: vi.fn().mockResolvedValue([]),
      });
    });

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.promises.readdir).mockResolvedValue([
      "001_initial.sql",
      "README.md",
      ".DS_Store",
      "002_update.sql",
      // biome-ignore lint/suspicious/noExplicitAny: test mock for fs.readdir overloads
    ] as any);
    vi.mocked(fs.promises.readFile).mockResolvedValue("CREATE TABLE t (id VARCHAR)");

    const count = await runMigrations(conn, {
      migrationsDir: "/app/migrations",
      logger: false,
    });

    expect(count).toBe(2);
    // readFile should only be called for .sql files
    expect(fs.promises.readFile).toHaveBeenCalledTimes(2);
  });
});
