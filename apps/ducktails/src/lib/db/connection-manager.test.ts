import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockConn, mockInstance } = vi.hoisted(() => {
  const mockConn = { closeSync: vi.fn() };
  const mockInstance = { connect: vi.fn().mockResolvedValue(mockConn) };
  return { mockConn, mockInstance };
});

vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    copyFileSync: vi.fn(),
    unlinkSync: vi.fn(),
    statSync: vi.fn(),
  },
}));

vi.mock("@duckdb/node-api", () => ({
  DuckDBInstance: {
    create: vi.fn().mockResolvedValue(mockInstance),
  },
}));

import fs from "node:fs";
import { DuckDBInstance } from "@duckdb/node-api";

// Clear the globalThis cache between tests
function clearCache() {
  const g = globalThis as Record<string, unknown>;
  delete g.__ducktails_snapshots;
  delete g.__ducktails_promises;
}

describe("connection-manager", () => {
  beforeEach(() => {
    clearCache();
    vi.clearAllMocks();
    // Re-setup mock implementations after clearAllMocks
    vi.mocked(fs.existsSync).mockReturnValue(true);
    mockInstance.connect.mockResolvedValue(mockConn);
    vi.mocked(DuckDBInstance.create).mockResolvedValue(mockInstance as never);
  });

  afterEach(() => {
    clearCache();
  });

  describe("databaseFileExists", () => {
    it("returns true when file exists", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      const { databaseFileExists } = await import("./connection-manager");
      expect(databaseFileExists("/some/path.duckdb")).toBe(true);
    });

    it("returns false when file does not exist", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const { databaseFileExists } = await import("./connection-manager");
      expect(databaseFileExists("/missing/path.duckdb")).toBe(false);
    });
  });

  describe("getConnection", () => {
    it("creates a snapshot and returns a connection", async () => {
      const { getConnection } = await import("./connection-manager");
      const conn = await getConnection("/test/db.duckdb");

      expect(fs.mkdirSync).toHaveBeenCalled();
      expect(fs.copyFileSync).toHaveBeenCalled();
      expect(DuckDBInstance.create).toHaveBeenCalled();
      expect(conn).toBe(mockConn);
    });

    it("returns cached connection within TTL", async () => {
      const { getConnection } = await import("./connection-manager");

      const conn1 = await getConnection("/test/db.duckdb");
      vi.mocked(DuckDBInstance.create).mockClear();

      const conn2 = await getConnection("/test/db.duckdb");

      expect(DuckDBInstance.create).not.toHaveBeenCalled();
      expect(conn2).toBe(conn1);
    });

    it("refreshes connection after TTL expires", async () => {
      vi.useFakeTimers();
      const { getConnection } = await import("./connection-manager");

      await getConnection("/test/db.duckdb");
      vi.mocked(DuckDBInstance.create).mockClear();

      // Advance past 5s TTL
      vi.advanceTimersByTime(6_000);

      const newMockConn = { closeSync: vi.fn() };
      const newMockInstance = { connect: vi.fn().mockResolvedValue(newMockConn) };
      vi.mocked(DuckDBInstance.create).mockResolvedValue(newMockInstance as never);

      const conn2 = await getConnection("/test/db.duckdb");
      expect(DuckDBInstance.create).toHaveBeenCalled();
      expect(conn2).toBe(newMockConn);

      vi.useRealTimers();
    });

    it("deduplicates concurrent requests for the same path", async () => {
      const { getConnection } = await import("./connection-manager");

      const [conn1, conn2] = await Promise.all([
        getConnection("/test/dedup.duckdb"),
        getConnection("/test/dedup.duckdb"),
      ]);

      // Both should get the same connection from a single create call
      expect(conn1).toBe(conn2);
    });
  });

  describe("getSnapshotTime", () => {
    it("returns null when no snapshot exists", async () => {
      const { getSnapshotTime } = await import("./connection-manager");
      expect(getSnapshotTime("/unknown/path.duckdb")).toBeNull();
    });

    it("returns the copiedAt timestamp after getConnection", async () => {
      const { getConnection, getSnapshotTime } = await import("./connection-manager");
      const before = Date.now();
      await getConnection("/test/snapshot.duckdb");
      const time = getSnapshotTime("/test/snapshot.duckdb");
      expect(time).toBeGreaterThanOrEqual(before);
      expect(time).toBeLessThanOrEqual(Date.now());
    });
  });

  describe("closeConnection", () => {
    it("closes a connection and cleans up files", async () => {
      const { closeConnection, getConnection, getSnapshotTime } = await import("./connection-manager");

      await getConnection("/test/close.duckdb");
      closeConnection("/test/close.duckdb");

      expect(mockConn.closeSync).toHaveBeenCalled();
      expect(fs.unlinkSync).toHaveBeenCalled();
      expect(getSnapshotTime("/test/close.duckdb")).toBeNull();
    });

    it("is a no-op for unknown paths", async () => {
      const { closeConnection } = await import("./connection-manager");
      // Should not throw
      closeConnection("/unknown/path.duckdb");
    });
  });

  describe("closeAllConnections", () => {
    it("closes all open connections", async () => {
      const { closeAllConnections, getConnection, getSnapshotTime } = await import("./connection-manager");

      await getConnection("/test/a.duckdb");
      await getConnection("/test/b.duckdb");

      closeAllConnections();

      expect(getSnapshotTime("/test/a.duckdb")).toBeNull();
      expect(getSnapshotTime("/test/b.duckdb")).toBeNull();
    });
  });

  describe("getWritableConnection", () => {
    it("creates a new instance directly on the original path", async () => {
      const { getWritableConnection } = await import("./connection-manager");

      const conn = await getWritableConnection("/test/writable.duckdb");
      expect(DuckDBInstance.create).toHaveBeenCalledWith("/test/writable.duckdb");
      expect(conn).toBe(mockConn);
    });
  });
});
