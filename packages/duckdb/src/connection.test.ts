import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    default: {
      ...actual,
      mkdirSync: vi.fn(),
      existsSync: vi.fn(),
      unlinkSync: vi.fn(),
    },
    mkdirSync: vi.fn(),
    existsSync: vi.fn(),
    unlinkSync: vi.fn(),
  };
});

vi.mock("@duckdb/node-api", () => ({
  DuckDBInstance: {
    create: vi.fn(),
  },
}));

vi.mock("./helpers", () => ({
  execute: vi.fn(),
  checkpoint: vi.fn(),
}));

import fs from "node:fs";
import { DuckDBInstance } from "@duckdb/node-api";
import { createDatabase } from "./connection";
import { checkpoint, execute } from "./helpers";

interface GlobalDbCache {
  __duckdb_instance?: unknown;
  __duckdb_connection?: unknown;
  __duckdb_initPromise?: unknown;
  __duckdb_shutdownRegistered?: boolean;
}

function cleanGlobalCache() {
  const g = globalThis as GlobalDbCache;
  delete g.__duckdb_instance;
  delete g.__duckdb_connection;
  delete g.__duckdb_initPromise;
  delete g.__duckdb_shutdownRegistered;
}

function createMockConnection() {
  return {
    closeSync: vi.fn(),
  };
}

function createMockInstance(conn = createMockConnection()) {
  return {
    connect: vi.fn().mockResolvedValue(conn),
  };
}

describe("createDatabase", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    cleanGlobalCache();
  });

  afterEach(() => {
    cleanGlobalCache();
  });

  describe("getDb", () => {
    it("creates directory, instance, and connection", async () => {
      const mockConn = createMockConnection();
      const mockInstance = createMockInstance(mockConn);
      vi.mocked(DuckDBInstance.create).mockResolvedValue(mockInstance as never);

      const db = createDatabase({ dbPath: "/tmp/test/data.duckdb" });
      const conn = await db.getDb();

      expect(fs.mkdirSync).toHaveBeenCalledWith("/tmp/test", { recursive: true });
      expect(DuckDBInstance.create).toHaveBeenCalledWith("/tmp/test/data.duckdb");
      expect(mockInstance.connect).toHaveBeenCalled();
      expect(execute).toHaveBeenCalledWith(mockConn, "SET wal_autocheckpoint = '256KB'");
      expect(conn).toBe(mockConn);
    });

    it("returns cached connection on subsequent calls", async () => {
      const mockConn = createMockConnection();
      const mockInstance = createMockInstance(mockConn);
      vi.mocked(DuckDBInstance.create).mockResolvedValue(mockInstance as never);

      const db = createDatabase({ dbPath: "/tmp/test.duckdb" });
      const conn1 = await db.getDb();
      const conn2 = await db.getDb();

      expect(conn1).toBe(conn2);
      expect(DuckDBInstance.create).toHaveBeenCalledTimes(1);
    });

    it("deduplicates concurrent init calls via pending promise", async () => {
      const mockConn = createMockConnection();
      const mockInstance = createMockInstance(mockConn);
      vi.mocked(DuckDBInstance.create).mockResolvedValue(mockInstance as never);

      const db = createDatabase({ dbPath: "/tmp/test.duckdb" });
      const [conn1, conn2] = await Promise.all([db.getDb(), db.getDb()]);

      expect(conn1).toBe(conn2);
      expect(DuckDBInstance.create).toHaveBeenCalledTimes(1);
    });

    it("uses custom walAutocheckpoint", async () => {
      const mockConn = createMockConnection();
      const mockInstance = createMockInstance(mockConn);
      vi.mocked(DuckDBInstance.create).mockResolvedValue(mockInstance as never);

      const db = createDatabase({ dbPath: "/tmp/test.duckdb", walAutocheckpoint: "512KB" });
      await db.getDb();

      expect(execute).toHaveBeenCalledWith(mockConn, "SET wal_autocheckpoint = '512KB'");
    });

    it("calls onInit callback after connection", async () => {
      const mockConn = createMockConnection();
      const mockInstance = createMockInstance(mockConn);
      vi.mocked(DuckDBInstance.create).mockResolvedValue(mockInstance as never);
      const onInit = vi.fn();

      const db = createDatabase({ dbPath: "/tmp/test.duckdb", onInit });
      await db.getDb();

      expect(onInit).toHaveBeenCalledWith(mockConn);
    });

    describe("WAL corruption recovery", () => {
      it("removes WAL file and retries when DuckDB fails to open", async () => {
        const mockConn = createMockConnection();
        const mockInstance = createMockInstance(mockConn);
        vi.mocked(DuckDBInstance.create)
          .mockRejectedValueOnce(new Error("WAL corruption"))
          .mockResolvedValueOnce(mockInstance as never);
        vi.mocked(fs.existsSync).mockReturnValue(true);

        const db = createDatabase({ dbPath: "/tmp/test.duckdb" });
        const conn = await db.getDb();

        expect(fs.existsSync).toHaveBeenCalledWith("/tmp/test.duckdb.wal");
        expect(fs.unlinkSync).toHaveBeenCalledWith("/tmp/test.duckdb.wal");
        expect(DuckDBInstance.create).toHaveBeenCalledTimes(2);
        expect(conn).toBe(mockConn);
      });

      it("throws original error when no WAL file exists", async () => {
        vi.mocked(DuckDBInstance.create).mockRejectedValue(new Error("other error"));
        vi.mocked(fs.existsSync).mockReturnValue(false);

        const db = createDatabase({ dbPath: "/tmp/test.duckdb" });
        await expect(db.getDb()).rejects.toThrow("other error");
      });
    });

    describe("globalThis caching", () => {
      it("stores connection on globalThis when useGlobalCache is true", async () => {
        const mockConn = createMockConnection();
        const mockInstance = createMockInstance(mockConn);
        vi.mocked(DuckDBInstance.create).mockResolvedValue(mockInstance as never);

        const db = createDatabase({ dbPath: "/tmp/test.duckdb", useGlobalCache: true });
        await db.getDb();

        const g = globalThis as GlobalDbCache;
        expect(g.__duckdb_connection).toBe(mockConn);
        expect(g.__duckdb_instance).toBe(mockInstance);
      });

      it("does not store on globalThis when useGlobalCache is false", async () => {
        const mockConn = createMockConnection();
        const mockInstance = createMockInstance(mockConn);
        vi.mocked(DuckDBInstance.create).mockResolvedValue(mockInstance as never);

        const db = createDatabase({ dbPath: "/tmp/test.duckdb", useGlobalCache: false });
        await db.getDb();

        const g = globalThis as GlobalDbCache;
        expect(g.__duckdb_connection).toBeUndefined();
      });
    });

    describe("signal handler registration", () => {
      it("registers shutdown handlers for globalThis mode", async () => {
        const processOnSpy = vi.spyOn(process, "on").mockImplementation(() => process);
        const mockConn = createMockConnection();
        const mockInstance = createMockInstance(mockConn);
        vi.mocked(DuckDBInstance.create).mockResolvedValue(mockInstance as never);

        const db = createDatabase({ dbPath: "/tmp/test.duckdb", useGlobalCache: true });
        await db.getDb();

        expect(processOnSpy).toHaveBeenCalledWith("SIGINT", expect.any(Function));
        expect(processOnSpy).toHaveBeenCalledWith("SIGTERM", expect.any(Function));
        expect(processOnSpy).toHaveBeenCalledWith("beforeExit", expect.any(Function));

        processOnSpy.mockRestore();
      });

      it("registers shutdown handlers only once", async () => {
        const processOnSpy = vi.spyOn(process, "on").mockImplementation(() => process);
        const mockConn = createMockConnection();
        const mockInstance = createMockInstance(mockConn);
        vi.mocked(DuckDBInstance.create).mockResolvedValue(mockInstance as never);

        const db1 = createDatabase({ dbPath: "/tmp/test1.duckdb", useGlobalCache: true });
        await db1.getDb();
        const firstCallCount = processOnSpy.mock.calls.length;

        // Create another database instance with globalThis caching
        cleanGlobalCache();
        // Re-set __duckdb_shutdownRegistered to true to simulate it already being registered
        (globalThis as GlobalDbCache).__duckdb_shutdownRegistered = true;

        const db2 = createDatabase({ dbPath: "/tmp/test2.duckdb", useGlobalCache: true });
        vi.mocked(DuckDBInstance.create).mockResolvedValue(mockInstance as never);
        await db2.getDb();

        // Should not register more handlers since shutdownRegistered is already true
        expect(processOnSpy.mock.calls.length).toBe(firstCallCount);

        processOnSpy.mockRestore();
      });

      it("does not register shutdown handlers for non-globalThis mode", async () => {
        const processOnSpy = vi.spyOn(process, "on").mockImplementation(() => process);
        const mockConn = createMockConnection();
        const mockInstance = createMockInstance(mockConn);
        vi.mocked(DuckDBInstance.create).mockResolvedValue(mockInstance as never);

        const db = createDatabase({ dbPath: "/tmp/test.duckdb", useGlobalCache: false });
        await db.getDb();

        expect(processOnSpy).not.toHaveBeenCalledWith("SIGINT", expect.any(Function));
        expect(processOnSpy).not.toHaveBeenCalledWith("SIGTERM", expect.any(Function));

        processOnSpy.mockRestore();
      });
    });
  });

  describe("close", () => {
    it("checkpoints and closes connection", async () => {
      const mockConn = createMockConnection();
      const mockInstance = createMockInstance(mockConn);
      vi.mocked(DuckDBInstance.create).mockResolvedValue(mockInstance as never);

      const db = createDatabase({ dbPath: "/tmp/test.duckdb", useGlobalCache: false });
      await db.getDb();
      await db.close();

      expect(checkpoint).toHaveBeenCalledWith(mockConn);
      expect(mockConn.closeSync).toHaveBeenCalled();
    });

    it("is a no-op when no connection exists", async () => {
      const db = createDatabase({ dbPath: "/tmp/test.duckdb", useGlobalCache: false });
      await db.close();

      expect(checkpoint).not.toHaveBeenCalled();
    });

    it("clears globalThis cache on close", async () => {
      const mockConn = createMockConnection();
      const mockInstance = createMockInstance(mockConn);
      vi.mocked(DuckDBInstance.create).mockResolvedValue(mockInstance as never);

      const db = createDatabase({ dbPath: "/tmp/test.duckdb", useGlobalCache: true });
      await db.getDb();

      const g = globalThis as GlobalDbCache;
      expect(g.__duckdb_connection).toBe(mockConn);

      await db.close();

      expect(g.__duckdb_connection).toBeNull();
      expect(g.__duckdb_instance).toBeNull();
      expect(g.__duckdb_initPromise).toBeNull();
    });

    it("clears local cache on close", async () => {
      const mockConn = createMockConnection();
      const mockInstance = createMockInstance(mockConn);
      vi.mocked(DuckDBInstance.create).mockResolvedValue(mockInstance as never);

      const db = createDatabase({ dbPath: "/tmp/test.duckdb", useGlobalCache: false });
      await db.getDb();
      await db.close();

      // After close, getDb should create a new connection
      vi.mocked(DuckDBInstance.create).mockResolvedValue(createMockInstance() as never);
      await db.getDb();
      expect(DuckDBInstance.create).toHaveBeenCalledTimes(2);
    });

    it("swallows checkpoint errors gracefully", async () => {
      const mockConn = createMockConnection();
      const mockInstance = createMockInstance(mockConn);
      vi.mocked(DuckDBInstance.create).mockResolvedValue(mockInstance as never);
      vi.mocked(checkpoint).mockRejectedValue(new Error("checkpoint failed"));

      const db = createDatabase({ dbPath: "/tmp/test.duckdb", useGlobalCache: false });
      await db.getDb();

      // Should not throw
      await db.close();
      expect(mockConn.closeSync).toHaveBeenCalled();
    });
  });
});
