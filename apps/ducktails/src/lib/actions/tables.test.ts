import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockConn } = vi.hoisted(() => {
  const mockConn = {};
  return { mockConn };
});

vi.mock("@claudekit/duckdb", () => ({
  queryAll: vi.fn(),
  queryOne: vi.fn(),
}));

vi.mock("@/lib/db/connection-manager", () => ({
  getConnection: vi.fn().mockResolvedValue(mockConn),
}));

vi.mock("@/lib/db/registry", () => ({
  getDatabaseEntry: vi.fn((id: string) =>
    id === "test" ? { id: "test", name: "Test", app: "test", path: "/test/data.duckdb" } : undefined,
  ),
}));

import { queryAll, queryOne } from "@claudekit/duckdb";
import { getSchemaForCompletion, getTablePrimaryKey, getTableRowCount, getTableSchema, listTables } from "./tables";

describe("listTables", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns tables with row counts", async () => {
    vi.mocked(queryAll).mockResolvedValue([{ table_name: "users" }, { table_name: "posts" }]);
    vi.mocked(queryOne).mockResolvedValueOnce({ cnt: 10 }).mockResolvedValueOnce({ cnt: 5 });

    const tables = await listTables("test");

    expect(tables).toEqual([
      { name: "users", rowCount: 10 },
      { name: "posts", rowCount: 5 },
    ]);
  });

  it("skips tables with invalid names", async () => {
    vi.mocked(queryAll).mockResolvedValue([{ table_name: "valid_table" }, { table_name: "invalid-name" }]);
    vi.mocked(queryOne).mockResolvedValue({ cnt: 3 });

    const tables = await listTables("test");

    expect(tables).toHaveLength(1);
    expect(tables[0].name).toBe("valid_table");
  });

  it("throws for unknown database", async () => {
    await expect(listTables("unknown")).rejects.toThrow("Unknown database: unknown");
  });

  it("defaults row count to 0 when queryOne returns null", async () => {
    vi.mocked(queryAll).mockResolvedValue([{ table_name: "empty" }]);
    vi.mocked(queryOne).mockResolvedValue(null);

    const tables = await listTables("test");
    expect(tables[0].rowCount).toBe(0);
  });
});

describe("getTableSchema", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns column info for a valid table", async () => {
    const mockColumns = [
      { column_name: "id", data_type: "INTEGER", is_nullable: "NO", column_default: null },
      { column_name: "name", data_type: "VARCHAR", is_nullable: "YES", column_default: null },
    ];
    vi.mocked(queryAll).mockResolvedValue(mockColumns);

    const schema = await getTableSchema("test", "users");

    expect(schema).toEqual(mockColumns);
    expect(queryAll).toHaveBeenCalledWith(mockConn, expect.stringContaining("information_schema.columns"), ["users"]);
  });

  it("throws for invalid table name", async () => {
    await expect(getTableSchema("test", "invalid-name")).rejects.toThrow("Invalid table name");
  });

  it("throws for unknown database", async () => {
    await expect(getTableSchema("unknown", "users")).rejects.toThrow("Unknown database: unknown");
  });
});

describe("getTableRowCount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the row count", async () => {
    vi.mocked(queryOne).mockResolvedValue({ cnt: 42 });
    expect(await getTableRowCount("test", "users")).toBe(42);
  });

  it("returns 0 when queryOne returns null", async () => {
    vi.mocked(queryOne).mockResolvedValue(null);
    expect(await getTableRowCount("test", "users")).toBe(0);
  });

  it("throws for invalid table name", async () => {
    await expect(getTableRowCount("test", "bad-name")).rejects.toThrow("Invalid table name");
  });
});

describe("getSchemaForCompletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns grouped table/column schema", async () => {
    vi.mocked(queryAll).mockResolvedValue([
      { table_name: "users", column_name: "id" },
      { table_name: "users", column_name: "name" },
      { table_name: "posts", column_name: "id" },
      { table_name: "posts", column_name: "title" },
    ]);

    const schema = await getSchemaForCompletion("test");

    expect(schema).toEqual({
      users: ["id", "name"],
      posts: ["id", "title"],
    });
  });

  it("throws for unknown database", async () => {
    await expect(getSchemaForCompletion("unknown")).rejects.toThrow("Unknown database: unknown");
  });
});

describe("getTablePrimaryKey", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns primary key columns as array", async () => {
    vi.mocked(queryAll).mockResolvedValue([{ constraint_column_names: ["id"] }]);

    const pk = await getTablePrimaryKey("test", "users");
    expect(pk).toEqual(["id"]);
  });

  it("parses string representation of columns", async () => {
    vi.mocked(queryAll).mockResolvedValue([{ constraint_column_names: '["id","name"]' }]);

    const pk = await getTablePrimaryKey("test", "composite");
    expect(pk).toEqual(["id", "name"]);
  });

  it("wraps plain string in array", async () => {
    vi.mocked(queryAll).mockResolvedValue([{ constraint_column_names: "id" }]);

    const pk = await getTablePrimaryKey("test", "single");
    expect(pk).toEqual(["id"]);
  });

  it("returns empty array when no primary key", async () => {
    vi.mocked(queryAll).mockResolvedValue([]);

    const pk = await getTablePrimaryKey("test", "no_pk");
    expect(pk).toEqual([]);
  });

  it("returns empty array when query throws", async () => {
    vi.mocked(queryAll).mockRejectedValue(new Error("duckdb_constraints not found"));

    const pk = await getTablePrimaryKey("test", "fallback");
    expect(pk).toEqual([]);
  });

  it("throws for unknown database", async () => {
    await expect(getTablePrimaryKey("unknown", "users")).rejects.toThrow("Unknown database: unknown");
  });
});
