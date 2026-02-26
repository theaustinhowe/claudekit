import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockConn } = vi.hoisted(() => {
  const mockConn = {};
  return { mockConn };
});

vi.mock("@claudekit/duckdb", () => ({
  queryAll: vi.fn(),
}));

vi.mock("@/lib/db/connection-manager", () => ({
  getConnection: vi.fn().mockResolvedValue(mockConn),
}));

vi.mock("@/lib/db/registry", () => ({
  getDatabaseEntry: vi.fn((id: string) =>
    id === "test" ? { id: "test", name: "Test", app: "test", path: "/test/data.duckdb" } : undefined,
  ),
}));

import { queryAll } from "@claudekit/duckdb";
import { executeQuery } from "./query";

describe("executeQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("executes a query and returns results", async () => {
    vi.mocked(queryAll).mockResolvedValue([
      { id: 1, name: "Alice" },
      { id: 2, name: "Bob" },
    ]);

    const result = await executeQuery("test", "SELECT * FROM users");

    expect(queryAll).toHaveBeenCalledWith(mockConn, "SELECT * FROM users");
    expect(result.columns).toEqual(["id", "name"]);
    expect(result.rows).toHaveLength(2);
    expect(result.rowCount).toBe(2);
    expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
    expect(result.error).toBeUndefined();
  });

  it("returns error for empty query", async () => {
    const result = await executeQuery("test", "   ");

    expect(queryAll).not.toHaveBeenCalled();
    expect(result.error).toBe("Empty query");
    expect(result.columns).toEqual([]);
    expect(result.rowCount).toBe(0);
  });

  it("throws for unknown database", async () => {
    await expect(executeQuery("unknown", "SELECT 1")).rejects.toThrow("Unknown database: unknown");
  });

  it("returns error on query failure", async () => {
    vi.mocked(queryAll).mockRejectedValue(new Error("Syntax error"));

    const result = await executeQuery("test", "INVALID SQL");

    expect(result.error).toBe("Syntax error");
    expect(result.columns).toEqual([]);
    expect(result.rowCount).toBe(0);
    expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("returns empty columns when query returns no rows", async () => {
    vi.mocked(queryAll).mockResolvedValue([]);

    const result = await executeQuery("test", "SELECT * FROM empty_table");

    expect(result.columns).toEqual([]);
    expect(result.rows).toEqual([]);
    expect(result.rowCount).toBe(0);
  });

  it("handles non-Error exceptions", async () => {
    vi.mocked(queryAll).mockRejectedValue("string error");

    const result = await executeQuery("test", "SELECT 1");

    expect(result.error).toBe("string error");
  });
});
