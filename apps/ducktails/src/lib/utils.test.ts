import { describe, expect, it } from "vitest";
import { formatCellValue, formatFileSize, quoteIdentifier, validateIdentifier } from "./utils";

describe("validateIdentifier", () => {
  it("accepts valid identifiers", () => {
    expect(validateIdentifier("users")).toBe(true);
    expect(validateIdentifier("_private")).toBe(true);
    expect(validateIdentifier("table_name_2")).toBe(true);
    expect(validateIdentifier("A")).toBe(true);
  });

  it("rejects identifiers starting with numbers", () => {
    expect(validateIdentifier("2things")).toBe(false);
  });

  it("rejects identifiers with special characters", () => {
    expect(validateIdentifier("user-name")).toBe(false);
    expect(validateIdentifier("table.name")).toBe(false);
    expect(validateIdentifier("col name")).toBe(false);
    expect(validateIdentifier("drop;--")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(validateIdentifier("")).toBe(false);
  });
});

describe("quoteIdentifier", () => {
  it("wraps in double quotes", () => {
    expect(quoteIdentifier("users")).toBe('"users"');
  });

  it("escapes embedded double quotes", () => {
    expect(quoteIdentifier('my"table')).toBe('"my""table"');
  });

  it("handles empty string", () => {
    expect(quoteIdentifier("")).toBe('""');
  });
});

describe("formatCellValue", () => {
  it("returns NULL for null and undefined", () => {
    expect(formatCellValue(null)).toBe("NULL");
    expect(formatCellValue(undefined)).toBe("NULL");
  });

  it("formats booleans", () => {
    expect(formatCellValue(true)).toBe("true");
    expect(formatCellValue(false)).toBe("false");
  });

  it("formats Uint8Array as BLOB", () => {
    expect(formatCellValue(new Uint8Array([1, 2, 3]))).toBe("[BLOB: 3 bytes]");
    expect(formatCellValue(new Uint8Array([]))).toBe("[BLOB: 0 bytes]");
  });

  it("JSON-stringifies plain objects", () => {
    expect(formatCellValue({ a: 1 })).toBe('{"a":1}');
    expect(formatCellValue([1, 2])).toBe("[1,2]");
  });

  it("converts numbers and strings via String()", () => {
    expect(formatCellValue(42)).toBe("42");
    expect(formatCellValue("hello")).toBe("hello");
    expect(formatCellValue(0)).toBe("0");
  });
});

describe("formatFileSize", () => {
  it("formats 0 bytes", () => {
    expect(formatFileSize(0)).toBe("0 B");
  });

  it("formats bytes", () => {
    expect(formatFileSize(500)).toBe("500 B");
  });

  it("formats kilobytes", () => {
    expect(formatFileSize(1024)).toBe("1.0 KB");
    expect(formatFileSize(1536)).toBe("1.5 KB");
  });

  it("formats megabytes", () => {
    expect(formatFileSize(1048576)).toBe("1.0 MB");
  });

  it("formats gigabytes", () => {
    expect(formatFileSize(1073741824)).toBe("1.0 GB");
  });
});
