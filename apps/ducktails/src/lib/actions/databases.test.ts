import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockConn } = vi.hoisted(() => {
  const mockConn = {};
  return { mockConn };
});

vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(true),
    statSync: vi.fn().mockReturnValue({ size: 4096 }),
  },
}));

vi.mock("@claudekit/duckdb", () => ({
  queryAll: vi.fn(),
}));

vi.mock("@/lib/db/connection-manager", () => ({
  databaseFileExists: vi.fn(),
  getConnection: vi.fn().mockResolvedValue(mockConn),
  closeAllConnections: vi.fn(),
}));

vi.mock("@/lib/db/registry", () => ({
  DATABASE_REGISTRY: [
    { id: "test1", name: "Test1", app: "app1", path: "/test/db1.duckdb" },
    { id: "test2", name: "Test2", app: "app2", path: "/test/db2.duckdb" },
  ],
  getDatabaseEntry: vi.fn((id: string) => {
    if (id === "test1") return { id: "test1", name: "Test1", app: "app1", path: "/test/db1.duckdb" };
    if (id === "test2") return { id: "test2", name: "Test2", app: "app2", path: "/test/db2.duckdb" };
    return undefined;
  }),
}));

import fs from "node:fs";
import { queryAll } from "@claudekit/duckdb";
import { closeAllConnections, databaseFileExists } from "@/lib/db/connection-manager";
import { getDatabaseEntry, listDatabases, refreshSnapshots } from "./databases";

describe("listDatabases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(databaseFileExists).mockReturnValue(true);
    vi.mocked(queryAll).mockResolvedValue([{ table_name: "t1" }, { table_name: "t2" }]);
    vi.mocked(fs.statSync).mockReturnValue({ size: 4096 } as ReturnType<typeof fs.statSync>);
  });

  it("returns online databases with table counts and file sizes", async () => {
    const { databases, refreshedAt } = await listDatabases();

    expect(databases).toHaveLength(2);
    expect(databases[0].status).toBe("online");
    expect(databases[0].tableCount).toBe(2);
    expect(databases[0].fileSize).toBe(4096);
    expect(refreshedAt).toBeGreaterThan(0);
  });

  it("returns not_found status when database file is missing", async () => {
    vi.mocked(databaseFileExists).mockReturnValue(false);

    const { databases } = await listDatabases();

    expect(databases[0].status).toBe("not_found");
    expect(databases[0].tableCount).toBe(0);
    expect(databases[0].fileSize).toBe(0);
  });

  it("returns locked status when connection fails with lock error", async () => {
    vi.mocked(databaseFileExists).mockReturnValue(true);
    const { getConnection } = await import("@/lib/db/connection-manager");
    vi.mocked(getConnection)
      .mockRejectedValueOnce(new Error("Could not set lock on file"))
      .mockResolvedValueOnce(mockConn as never);

    const { databases } = await listDatabases();

    expect(databases[0].status).toBe("locked");
    expect(databases[0].error).toContain("lock");
  });

  it("returns error status for other connection failures", async () => {
    vi.mocked(databaseFileExists).mockReturnValue(true);
    const { getConnection } = await import("@/lib/db/connection-manager");
    vi.mocked(getConnection)
      .mockRejectedValueOnce(new Error("Corrupt database"))
      .mockResolvedValueOnce(mockConn as never);

    const { databases } = await listDatabases();

    expect(databases[0].status).toBe("error");
    expect(databases[0].error).toBe("Corrupt database");
  });

  it("gets file size even on error when file exists", async () => {
    vi.mocked(databaseFileExists).mockReturnValue(true);
    vi.mocked(fs.existsSync).mockReturnValue(true);
    const { getConnection } = await import("@/lib/db/connection-manager");
    vi.mocked(getConnection)
      .mockRejectedValueOnce(new Error("Some error"))
      .mockResolvedValueOnce(mockConn as never);

    const { databases } = await listDatabases();

    expect(databases[0].fileSize).toBe(4096);
  });
});

describe("getDatabaseEntry", () => {
  it("delegates to registry getDatabaseEntry", async () => {
    const entry = await getDatabaseEntry("test1");
    expect(entry?.id).toBe("test1");
  });

  it("returns undefined for unknown id", async () => {
    const entry = await getDatabaseEntry("nonexistent");
    expect(entry).toBeUndefined();
  });
});

describe("refreshSnapshots", () => {
  it("calls closeAllConnections", async () => {
    await refreshSnapshots();
    expect(closeAllConnections).toHaveBeenCalled();
  });
});
