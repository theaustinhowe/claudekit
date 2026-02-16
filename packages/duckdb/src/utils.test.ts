import { describe, expect, it } from "vitest";
import { buildInClause, buildUpdate, parseJsonField } from "./utils.js";

describe("parseJsonField", () => {
  it("parses valid JSON strings", () => {
    expect(parseJsonField('{"a":1}', {})).toEqual({ a: 1 });
    expect(parseJsonField("[1,2,3]", [])).toEqual([1, 2, 3]);
    expect(parseJsonField('"hello"', "")).toBe("hello");
    expect(parseJsonField("42", 0)).toBe(42);
    expect(parseJsonField("true", false)).toBe(true);
  });

  it("returns fallback for null", () => {
    expect(parseJsonField(null, { default: true })).toEqual({ default: true });
  });

  it("returns fallback for undefined", () => {
    expect(parseJsonField(undefined, [])).toEqual([]);
  });

  it("returns fallback for invalid JSON strings", () => {
    expect(parseJsonField("{bad json", "fallback")).toBe("fallback");
    expect(parseJsonField("not json at all", 0)).toBe(0);
  });

  it("passes through objects as-is", () => {
    const obj = { already: "parsed" };
    expect(parseJsonField(obj, {})).toBe(obj);
  });

  it("passes through arrays as-is", () => {
    const arr = [1, 2, 3];
    expect(parseJsonField(arr, [])).toBe(arr);
  });

  it("passes through numbers as-is", () => {
    expect(parseJsonField(42, 0)).toBe(42);
  });

  it("passes through booleans as-is", () => {
    expect(parseJsonField(true, false)).toBe(true);
  });
});

describe("buildUpdate", () => {
  const fixedTimestamp = "2026-01-15T00:00:00.000Z";
  const timestampFn = () => fixedTimestamp;

  it("generates SQL and params for simple fields", () => {
    const result = buildUpdate("jobs", "job-1", { status: "running", branch: "main" }, undefined, timestampFn);

    expect(result).not.toBeNull();
    expect(result?.sql).toBe("UPDATE jobs SET status = ?, branch = ?, updated_at = ? WHERE id = ?");
    expect(result?.params).toEqual(["running", "main", fixedTimestamp, "job-1"]);
  });

  it("skips undefined values", () => {
    const result = buildUpdate("jobs", "job-1", { status: "done", branch: undefined }, undefined, timestampFn);

    expect(result).not.toBeNull();
    expect(result?.sql).toBe("UPDATE jobs SET status = ?, updated_at = ? WHERE id = ?");
    expect(result?.params).toEqual(["done", fixedTimestamp, "job-1"]);
  });

  it("stringifies JSON fields", () => {
    const jsonFields = new Set(["config"]);
    const result = buildUpdate("repos", "repo-1", { config: { key: "val" } }, jsonFields, timestampFn);

    expect(result).not.toBeNull();
    expect(result?.params[0]).toBe('{"key":"val"}');
  });

  it("does not stringify non-JSON fields", () => {
    const jsonFields = new Set(["config"]);
    const result = buildUpdate("repos", "repo-1", { name: "test", config: { a: 1 } }, jsonFields, timestampFn);

    expect(result).not.toBeNull();
    expect(result?.params[0]).toBe("test");
    expect(result?.params[1]).toBe('{"a":1}');
  });

  it("appends updated_at timestamp", () => {
    const result = buildUpdate("jobs", "job-1", { status: "done" }, undefined, timestampFn);

    expect(result).not.toBeNull();
    expect(result?.sql).toContain("updated_at = ?");
    expect(result?.params).toContain(fixedTimestamp);
  });

  it("returns null when all values are undefined", () => {
    const result = buildUpdate("jobs", "job-1", { status: undefined, branch: undefined }, undefined, timestampFn);
    expect(result).toBeNull();
  });

  it("returns null for empty data object", () => {
    const result = buildUpdate("jobs", "job-1", {}, undefined, timestampFn);
    expect(result).toBeNull();
  });

  it("rejects unsafe table names", () => {
    expect(() => buildUpdate("jobs; DROP TABLE", "id-1", { a: 1 }, undefined, timestampFn)).toThrow(
      "Unsafe SQL table name",
    );
    expect(() => buildUpdate("my-table", "id-1", { a: 1 }, undefined, timestampFn)).toThrow("Unsafe SQL table name");
  });

  it("rejects unsafe column names", () => {
    expect(() => buildUpdate("jobs", "id-1", { "bad; DROP": 1 }, undefined, timestampFn)).toThrow(
      "Unsafe SQL column name",
    );
  });

  it("handles null values correctly", () => {
    const result = buildUpdate("jobs", "job-1", { status: null }, undefined, timestampFn);

    expect(result).not.toBeNull();
    expect(result?.params[0]).toBeNull();
  });

  it("uses default timestampFn when not provided", () => {
    const before = new Date().toISOString();
    const result = buildUpdate("jobs", "job-1", { status: "done" });
    const after = new Date().toISOString();

    expect(result).not.toBeNull();
    // The timestamp should be between before and after
    const ts = result?.params[1] as string;
    expect(ts >= before).toBe(true);
    expect(ts <= after).toBe(true);
  });
});

describe("buildInClause", () => {
  it("builds clause with placeholders and params", () => {
    const result = buildInClause("status", ["running", "queued", "done"]);

    expect(result.clause).toBe("status IN (?, ?, ?)");
    expect(result.params).toEqual(["running", "queued", "done"]);
  });

  it("builds single-element clause", () => {
    const result = buildInClause("id", ["abc"]);

    expect(result.clause).toBe("id IN (?)");
    expect(result.params).toEqual(["abc"]);
  });

  it("returns 1=0 for empty arrays", () => {
    const result = buildInClause("status", []);

    expect(result.clause).toBe("1=0");
    expect(result.params).toEqual([]);
  });

  it("rejects unsafe column names", () => {
    expect(() => buildInClause("col; DROP", ["a"])).toThrow("Unsafe SQL column name");
    expect(() => buildInClause("my-col", ["a"])).toThrow("Unsafe SQL column name");
    expect(() => buildInClause("123col", ["a"])).toThrow("Unsafe SQL column name");
  });

  it("accepts valid column names", () => {
    expect(() => buildInClause("status", ["a"])).not.toThrow();
    expect(() => buildInClause("_private_col", ["a"])).not.toThrow();
    expect(() => buildInClause("col123", ["a"])).not.toThrow();
    expect(() => buildInClause("CamelCase", ["a"])).not.toThrow();
  });

  it("does not mutate the original values array", () => {
    const values = ["a", "b", "c"];
    const original = [...values];
    buildInClause("col", values);
    expect(values).toEqual(original);
  });
});
