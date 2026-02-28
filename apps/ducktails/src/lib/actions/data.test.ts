import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockConn } = vi.hoisted(() => {
  const mockConn = { closeSync: vi.fn() };
  return { mockConn };
});

vi.mock("@claudekit/duckdb", () => ({
  queryAll: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
}));

vi.mock("@/lib/db/connection-manager", () => ({
  getConnection: vi.fn().mockResolvedValue(mockConn),
  getWritableConnection: vi.fn().mockResolvedValue(mockConn),
  closeConnection: vi.fn(),
}));

vi.mock("@/lib/db/registry", () => ({
  getDatabaseEntry: vi.fn((id: string) =>
    id === "test" ? { id: "test", name: "Test", app: "test", path: "/test/data.duckdb" } : undefined,
  ),
}));

import { execute, queryAll, queryOne } from "@claudekit/duckdb";
import { getWritableConnection } from "@/lib/db/connection-manager";
import { deleteRow, getTableData, insertRow, updateRow } from "./data";

describe("getTableData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock: columns query returns schema, count returns total, data returns rows
    vi.mocked(queryAll)
      .mockResolvedValueOnce([
        { column_name: "id", data_type: "INTEGER", is_nullable: "NO", column_default: null },
        { column_name: "name", data_type: "VARCHAR", is_nullable: "YES", column_default: null },
      ])
      .mockResolvedValueOnce([
        { id: 1, name: "Alice" },
        { id: 2, name: "Bob" },
      ]);
    vi.mocked(queryOne).mockResolvedValue({ cnt: 100 });
  });

  it("returns paginated data with defaults", async () => {
    const result = await getTableData("test", "users");

    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(50);
    expect(result.totalRows).toBe(100);
    expect(result.columns).toHaveLength(2);
    expect(result.rows).toHaveLength(2);
  });

  it("applies pagination parameters", async () => {
    await getTableData("test", "users", { page: 3, pageSize: 10 });

    // The data query (second queryAll call) should have LIMIT 10 OFFSET 20
    const dataCall = vi.mocked(queryAll).mock.calls[1];
    expect(dataCall[1]).toContain("LIMIT ? OFFSET ?");
    expect(dataCall[2]).toEqual([10, 20]);
  });

  it("applies sort column and direction", async () => {
    await getTableData("test", "users", { sortColumn: "name", sortDirection: "desc" });

    const dataCall = vi.mocked(queryAll).mock.calls[1];
    expect(dataCall[1]).toContain('ORDER BY "name" DESC');
  });

  it("defaults sort direction to ASC", async () => {
    await getTableData("test", "users", { sortColumn: "id" });

    const dataCall = vi.mocked(queryAll).mock.calls[1];
    expect(dataCall[1]).toContain('ORDER BY "id" ASC');
  });

  it("ignores invalid sort column", async () => {
    await getTableData("test", "users", { sortColumn: "invalid-col" });

    const dataCall = vi.mocked(queryAll).mock.calls[1];
    expect(dataCall[1]).not.toContain("ORDER BY");
  });

  it("applies contains filter", async () => {
    await getTableData("test", "users", {
      filters: [{ column: "name", operator: "contains", value: "ali" }],
    });

    const countCall = vi.mocked(queryOne).mock.calls[0];
    expect(countCall[1]).toContain('CAST("name" AS VARCHAR) ILIKE ?');
    expect(countCall[2]).toEqual(["%ali%"]);
  });

  it("applies eq filter", async () => {
    await getTableData("test", "users", {
      filters: [{ column: "id", operator: "eq", value: "1" }],
    });

    const countCall = vi.mocked(queryOne).mock.calls[0];
    expect(countCall[1]).toContain('"id" = ?');
  });

  it("applies neq filter", async () => {
    await getTableData("test", "users", {
      filters: [{ column: "id", operator: "neq", value: "1" }],
    });

    const countCall = vi.mocked(queryOne).mock.calls[0];
    expect(countCall[1]).toContain('"id" != ?');
  });

  it("applies gt filter", async () => {
    await getTableData("test", "users", {
      filters: [{ column: "id", operator: "gt", value: "5" }],
    });

    const countCall = vi.mocked(queryOne).mock.calls[0];
    expect(countCall[1]).toContain('"id" > ?');
  });

  it("applies gte filter", async () => {
    await getTableData("test", "users", {
      filters: [{ column: "id", operator: "gte", value: "5" }],
    });

    const countCall = vi.mocked(queryOne).mock.calls[0];
    expect(countCall[1]).toContain('"id" >= ?');
  });

  it("applies lt filter", async () => {
    await getTableData("test", "users", {
      filters: [{ column: "id", operator: "lt", value: "5" }],
    });

    const countCall = vi.mocked(queryOne).mock.calls[0];
    expect(countCall[1]).toContain('"id" < ?');
  });

  it("applies lte filter", async () => {
    await getTableData("test", "users", {
      filters: [{ column: "id", operator: "lte", value: "5" }],
    });

    const countCall = vi.mocked(queryOne).mock.calls[0];
    expect(countCall[1]).toContain('"id" <= ?');
  });

  it("applies is_null filter", async () => {
    await getTableData("test", "users", {
      filters: [{ column: "name", operator: "is_null" }],
    });

    const countCall = vi.mocked(queryOne).mock.calls[0];
    expect(countCall[1]).toContain('"name" IS NULL');
  });

  it("applies is_not_null filter", async () => {
    await getTableData("test", "users", {
      filters: [{ column: "name", operator: "is_not_null" }],
    });

    const countCall = vi.mocked(queryOne).mock.calls[0];
    expect(countCall[1]).toContain('"name" IS NOT NULL');
  });

  it("applies is_true filter", async () => {
    await getTableData("test", "users", {
      filters: [{ column: "active", operator: "is_true" }],
    });

    const countCall = vi.mocked(queryOne).mock.calls[0];
    expect(countCall[1]).toContain('"active" = true');
  });

  it("applies is_false filter", async () => {
    await getTableData("test", "users", {
      filters: [{ column: "active", operator: "is_false" }],
    });

    const countCall = vi.mocked(queryOne).mock.calls[0];
    expect(countCall[1]).toContain('"active" = false');
  });

  it("skips filters with invalid column names", async () => {
    await getTableData("test", "users", {
      filters: [{ column: "bad-col", operator: "eq", value: "1" }],
    });

    const countCall = vi.mocked(queryOne).mock.calls[0];
    expect(countCall[1]).not.toContain("WHERE");
  });

  it("combines multiple filters with AND", async () => {
    await getTableData("test", "users", {
      filters: [
        { column: "id", operator: "gt", value: "1" },
        { column: "name", operator: "contains", value: "a" },
      ],
    });

    const countCall = vi.mocked(queryOne).mock.calls[0];
    expect(countCall[1]).toContain("AND");
  });

  it("throws for unknown database", async () => {
    await expect(getTableData("unknown", "users")).rejects.toThrow("Unknown database: unknown");
  });

  it("throws for invalid table name", async () => {
    await expect(getTableData("test", "bad-table")).rejects.toThrow("Invalid table name");
  });
});

describe("insertRow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("inserts a row with valid columns", async () => {
    await insertRow("test", "users", { id: 1, name: "Alice" });

    expect(execute).toHaveBeenCalledWith(
      mockConn,
      expect.stringContaining("INSERT INTO"),
      expect.arrayContaining([1, "Alice"]),
    );
  });

  it("filters out invalid column names", async () => {
    await insertRow("test", "users", { valid_col: "val", "bad-col": "skip" });

    const call = vi.mocked(execute).mock.calls[0];
    expect(call[1]).toContain('"valid_col"');
    expect(call[1]).not.toContain("bad-col");
  });

  it("throws when no valid columns", async () => {
    await expect(insertRow("test", "users", { "bad-col": "val" })).rejects.toThrow("No valid columns");
  });

  it("throws for unknown database", async () => {
    await expect(insertRow("unknown", "users", { id: 1 })).rejects.toThrow("Unknown database: unknown");
  });

  it("throws for invalid table name", async () => {
    await expect(insertRow("test", "bad-table", { id: 1 })).rejects.toThrow("Invalid table name");
  });

  it("converts undefined values to null", async () => {
    await insertRow("test", "users", { id: 1, name: undefined });

    const call = vi.mocked(execute).mock.calls[0];
    expect(call[2]).toEqual([1, null]);
  });
});

describe("updateRow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates a row with SET and WHERE clauses", async () => {
    await updateRow("test", "users", { id: 1 }, { name: "Bob" });

    expect(execute).toHaveBeenCalledWith(
      mockConn,
      expect.stringContaining("UPDATE"),
      expect.arrayContaining(["Bob", 1]),
    );
  });

  it("throws when no valid columns to update", async () => {
    await expect(updateRow("test", "users", { id: 1 }, { "bad-col": "val" })).rejects.toThrow(
      "No valid columns to update",
    );
  });

  it("throws when no valid primary key columns", async () => {
    await expect(updateRow("test", "users", { "bad-pk": 1 }, { name: "Bob" })).rejects.toThrow(
      "No primary key columns provided",
    );
  });

  it("throws for unknown database", async () => {
    await expect(updateRow("unknown", "users", { id: 1 }, { name: "Bob" })).rejects.toThrow(
      "Unknown database: unknown",
    );
  });
});

describe("deleteRow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes a row by primary key", async () => {
    await deleteRow("test", "users", { id: 1 });

    expect(execute).toHaveBeenCalledWith(mockConn, expect.stringContaining("DELETE FROM"), [1]);
  });

  it("handles composite primary keys", async () => {
    await deleteRow("test", "user_roles", { user_id: 1, role_id: 2 });

    const call = vi.mocked(execute).mock.calls[0];
    expect(call[1]).toContain("AND");
    expect(call[2]).toEqual([1, 2]);
  });

  it("throws when no valid primary key columns", async () => {
    await expect(deleteRow("test", "users", { "bad-pk": 1 })).rejects.toThrow("No primary key columns provided");
  });

  it("throws for unknown database", async () => {
    await expect(deleteRow("unknown", "users", { id: 1 })).rejects.toThrow("Unknown database: unknown");
  });

  it("throws for invalid table name", async () => {
    await expect(deleteRow("test", "bad-table", { id: 1 })).rejects.toThrow("Invalid table name");
  });
});

describe("withWritableConn (via insertRow)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("detects lock errors and throws user-friendly message", async () => {
    vi.mocked(getWritableConnection).mockRejectedValue(new Error("Could not set lock on file"));

    await expect(insertRow("test", "users", { id: 1 })).rejects.toThrow(
      "Database is locked by the owning app. Stop the app first to make edits.",
    );
  });

  it("re-throws non-lock errors", async () => {
    vi.mocked(getWritableConnection).mockRejectedValue(new Error("Permission denied"));

    await expect(insertRow("test", "users", { id: 1 })).rejects.toThrow("Permission denied");
  });

  it("detects lock keyword in non-Error exception messages", async () => {
    vi.mocked(getWritableConnection).mockRejectedValue("Could not set lock");

    await expect(insertRow("test", "users", { id: 1 })).rejects.toThrow(
      "Database is locked by the owning app. Stop the app first to make edits.",
    );
  });

  it("re-throws non-Error exceptions without lock keyword", async () => {
    vi.mocked(getWritableConnection).mockRejectedValue("Some other error");

    await expect(insertRow("test", "users", { id: 1 })).rejects.toBe("Some other error");
  });
});
