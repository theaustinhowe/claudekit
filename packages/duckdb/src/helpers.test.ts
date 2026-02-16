import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the @duckdb/node-api module before imports
vi.mock("@duckdb/node-api", () => {
  class DuckDBUUIDValue {
    private value: string;
    constructor(value: string) {
      this.value = value;
    }
    toString() {
      return this.value;
    }
  }

  class DuckDBTimestampTZValue {
    micros: bigint;
    constructor(micros: bigint) {
      this.micros = micros;
    }
  }

  return { DuckDBUUIDValue, DuckDBTimestampTZValue };
});

import { DuckDBTimestampTZValue, DuckDBUUIDValue } from "@duckdb/node-api";
import { checkpoint, convertRow, execute, queryAll, queryOne, withTransaction } from "./helpers.js";

// The real DuckDB classes have private constructors, but our mocks replace them.
// Cast to constructable types to avoid TypeScript errors in tests.
const MockUUID = DuckDBUUIDValue as unknown as new (value: string) => { toString(): string };
const MockTimestamp = DuckDBTimestampTZValue as unknown as new (micros: bigint) => { micros: bigint };

/** Create a mock DuckDB prepared statement */
function createMockPrepared(rows: Record<string, unknown>[] = []) {
  return {
    bindNull: vi.fn(),
    bindBoolean: vi.fn(),
    bindInteger: vi.fn(),
    bindDouble: vi.fn(),
    bindVarchar: vi.fn(),
    run: vi.fn().mockResolvedValue({
      getRowObjects: vi.fn().mockResolvedValue(rows),
    }),
  };
}

/** Create a mock DuckDB connection */
function createMockConn(prepared = createMockPrepared()) {
  return {
    prepare: vi.fn().mockResolvedValue(prepared),
  } as unknown as Parameters<typeof queryAll>[0];
}

describe("convertRow", () => {
  it("converts DuckDBUUIDValue to string", () => {
    const uuid = new MockUUID("550e8400-e29b-41d4-a716-446655440000");
    const result = convertRow<{ id: string }>({ id: uuid });
    expect(result.id).toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  it("converts DuckDBTimestampTZValue to ISO string", () => {
    // 1700000000000 ms = 1700000000000000 micros
    const ts = new MockTimestamp(1700000000000000n);
    const result = convertRow<{ created_at: string }>({ created_at: ts });
    expect(result.created_at).toBe(new Date(1700000000000).toISOString());
  });

  it("converts bigint to number", () => {
    const result = convertRow<{ count: number }>({ count: 42n });
    expect(result.count).toBe(42);
    expect(typeof result.count).toBe("number");
  });

  it("passes through primitive values", () => {
    const result = convertRow<{ name: string; age: number; active: boolean }>({
      name: "test",
      age: 25,
      active: true,
    });
    expect(result).toEqual({ name: "test", age: 25, active: true });
  });

  it("passes through null and undefined", () => {
    const result = convertRow<{ a: null; b: undefined }>({ a: null, b: undefined });
    expect(result.a).toBeNull();
    expect(result.b).toBeUndefined();
  });

  it("converts DuckDB wrapper objects with toString via constructor name check", () => {
    // Simulate an unknown DuckDB wrapper type
    class DuckDBSomeValue {
      toString() {
        return "some-value";
      }
    }
    const result = convertRow<{ val: string }>({ val: new DuckDBSomeValue() });
    expect(result.val).toBe("some-value");
  });
});

describe("queryAll", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("executes SQL and returns converted rows", async () => {
    const rows = [
      { id: "row-1", name: "first" },
      { id: "row-2", name: "second" },
    ];
    const prepared = createMockPrepared(rows);
    const conn = createMockConn(prepared);

    const result = await queryAll<{ id: string; name: string }>(conn, "SELECT * FROM jobs");

    expect(result).toEqual(rows);
    // biome-ignore lint/suspicious/noExplicitAny: accessing mock internals
    expect((conn as any).prepare).toHaveBeenCalledWith("SELECT * FROM jobs");
  });

  it("converts ? placeholders to $N parameters", async () => {
    const prepared = createMockPrepared([]);
    const conn = createMockConn(prepared);

    await queryAll(conn, "SELECT * FROM jobs WHERE status = ? AND id = ?", ["running", "abc"]);

    // biome-ignore lint/suspicious/noExplicitAny: accessing mock internals
    expect((conn as any).prepare).toHaveBeenCalledWith("SELECT * FROM jobs WHERE status = $1 AND id = $2");
  });

  it("binds null parameters with bindNull", async () => {
    const prepared = createMockPrepared([]);
    const conn = createMockConn(prepared);

    await queryAll(conn, "SELECT * FROM jobs WHERE val = ?", [null]);

    expect(prepared.bindNull).toHaveBeenCalledWith(1);
  });

  it("binds boolean parameters with bindBoolean", async () => {
    const prepared = createMockPrepared([]);
    const conn = createMockConn(prepared);

    await queryAll(conn, "SELECT * FROM jobs WHERE active = ?", [true]);

    expect(prepared.bindBoolean).toHaveBeenCalledWith(1, true);
  });

  it("binds integer parameters with bindInteger", async () => {
    const prepared = createMockPrepared([]);
    const conn = createMockConn(prepared);

    await queryAll(conn, "SELECT * FROM jobs WHERE count = ?", [42]);

    expect(prepared.bindInteger).toHaveBeenCalledWith(1, 42);
  });

  it("binds float parameters with bindDouble", async () => {
    const prepared = createMockPrepared([]);
    const conn = createMockConn(prepared);

    await queryAll(conn, "SELECT * FROM jobs WHERE rate = ?", [3.14]);

    expect(prepared.bindDouble).toHaveBeenCalledWith(1, 3.14);
  });

  it("binds string parameters with bindVarchar", async () => {
    const prepared = createMockPrepared([]);
    const conn = createMockConn(prepared);

    await queryAll(conn, "SELECT * FROM jobs WHERE name = ?", ["test"]);

    expect(prepared.bindVarchar).toHaveBeenCalledWith(1, "test");
  });

  it("does not bind parameters when params is empty", async () => {
    const prepared = createMockPrepared([]);
    const conn = createMockConn(prepared);

    await queryAll(conn, "SELECT * FROM jobs", []);

    expect(prepared.bindNull).not.toHaveBeenCalled();
    expect(prepared.bindVarchar).not.toHaveBeenCalled();
  });

  it("does not bind parameters when params is undefined", async () => {
    const prepared = createMockPrepared([]);
    const conn = createMockConn(prepared);

    await queryAll(conn, "SELECT * FROM jobs");

    expect(prepared.bindNull).not.toHaveBeenCalled();
    expect(prepared.bindVarchar).not.toHaveBeenCalled();
  });

  it("converts undefined params to null during binding", async () => {
    const prepared = createMockPrepared([]);
    const conn = createMockConn(prepared);

    await queryAll(conn, "SELECT * FROM jobs WHERE val = ?", [undefined]);

    // undefined gets converted to null in convertParams
    expect(prepared.bindNull).toHaveBeenCalledWith(1);
  });

  it("returns empty array for no results", async () => {
    const prepared = createMockPrepared([]);
    const conn = createMockConn(prepared);

    const result = await queryAll(conn, "SELECT * FROM jobs WHERE 1=0");
    expect(result).toEqual([]);
  });
});

describe("queryOne", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns the first row", async () => {
    const rows = [
      { id: "row-1", name: "first" },
      { id: "row-2", name: "second" },
    ];
    const prepared = createMockPrepared(rows);
    const conn = createMockConn(prepared);

    const result = await queryOne<{ id: string; name: string }>(conn, "SELECT * FROM jobs LIMIT 1");

    expect(result).toEqual({ id: "row-1", name: "first" });
  });

  it("returns undefined when no rows", async () => {
    const prepared = createMockPrepared([]);
    const conn = createMockConn(prepared);

    const result = await queryOne(conn, "SELECT * FROM jobs WHERE 1=0");
    expect(result).toBeUndefined();
  });
});

describe("execute", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("runs SQL without returning rows", async () => {
    const prepared = createMockPrepared();
    const conn = createMockConn(prepared);

    await execute(conn, "INSERT INTO jobs (id) VALUES (?)", ["job-1"]);

    // biome-ignore lint/suspicious/noExplicitAny: accessing mock internals
    expect((conn as any).prepare).toHaveBeenCalledWith("INSERT INTO jobs (id) VALUES ($1)");
    expect(prepared.bindVarchar).toHaveBeenCalledWith(1, "job-1");
    expect(prepared.run).toHaveBeenCalled();
  });

  it("runs SQL without params", async () => {
    const prepared = createMockPrepared();
    const conn = createMockConn(prepared);

    await execute(conn, "DELETE FROM jobs");

    // biome-ignore lint/suspicious/noExplicitAny: accessing mock internals
    expect((conn as any).prepare).toHaveBeenCalledWith("DELETE FROM jobs");
    expect(prepared.run).toHaveBeenCalled();
  });
});

describe("checkpoint", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("executes CHECKPOINT statement", async () => {
    const prepared = createMockPrepared();
    const conn = createMockConn(prepared);

    await checkpoint(conn);

    // biome-ignore lint/suspicious/noExplicitAny: accessing mock internals
    expect((conn as any).prepare).toHaveBeenCalledWith("CHECKPOINT");
    expect(prepared.run).toHaveBeenCalled();
  });
});

describe("withTransaction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("wraps function in BEGIN/COMMIT", async () => {
    const calls: string[] = [];
    const prepared = createMockPrepared();
    const conn = {
      prepare: vi.fn().mockImplementation((sql: string) => {
        calls.push(sql);
        return Promise.resolve(prepared);
      }),
    } as unknown as Parameters<typeof withTransaction>[0];

    const result = await withTransaction(conn, async () => {
      calls.push("user-fn");
      return "result-value";
    });

    expect(result).toBe("result-value");
    // BEGIN should come first, then user function, then COMMIT
    expect(calls[0]).toBe("BEGIN TRANSACTION");
    expect(calls).toContain("user-fn");
    expect(calls[calls.length - 1]).toBe("COMMIT");
  });

  it("rolls back on error", async () => {
    const calls: string[] = [];
    const prepared = createMockPrepared();
    const conn = {
      prepare: vi.fn().mockImplementation((sql: string) => {
        calls.push(sql);
        return Promise.resolve(prepared);
      }),
    } as unknown as Parameters<typeof withTransaction>[0];

    const error = new Error("test error");

    await expect(
      withTransaction(conn, async () => {
        throw error;
      }),
    ).rejects.toThrow("test error");

    expect(calls[0]).toBe("BEGIN TRANSACTION");
    expect(calls[calls.length - 1]).toBe("ROLLBACK");
    expect(calls).not.toContain("COMMIT");
  });

  it("returns the value from the callback", async () => {
    const prepared = createMockPrepared();
    const conn = createMockConn(prepared);

    const result = await withTransaction(conn, async () => ({ id: "new-id", status: "created" }));

    expect(result).toEqual({ id: "new-id", status: "created" });
  });
});
