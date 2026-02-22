import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expandTilde, formatNumber } from "./utils";

describe("expandTilde", () => {
  const originalHome = process.env.HOME;

  beforeEach(() => {
    process.env.HOME = "/Users/testuser";
  });

  afterEach(() => {
    process.env.HOME = originalHome;
  });

  it("expands ~/path to HOME/path", () => {
    expect(expandTilde("~/projects")).toBe("/Users/testuser/projects");
  });

  it("expands lone ~ to HOME", () => {
    expect(expandTilde("~")).toBe("/Users/testuser");
  });

  it("leaves absolute paths unchanged", () => {
    expect(expandTilde("/absolute/path")).toBe("/absolute/path");
  });

  it("leaves relative paths unchanged", () => {
    expect(expandTilde("relative/path")).toBe("relative/path");
  });

  it("handles missing HOME env var", () => {
    delete process.env.HOME;
    expect(expandTilde("~/projects")).toBe("/projects");
  });

  it("expands nested tilde paths", () => {
    expect(expandTilde("~/a/b/c")).toBe("/Users/testuser/a/b/c");
  });
});

describe("formatNumber", () => {
  it("formats integers with locale separators", () => {
    const result = formatNumber(1000);
    // Locale-dependent, but should contain the digits
    expect(result).toContain("1");
    expect(result).toContain("000");
  });

  it("formats zero", () => {
    expect(formatNumber(0)).toBe("0");
  });

  it("formats negative numbers", () => {
    const result = formatNumber(-1234);
    expect(result).toContain("1");
    expect(result).toContain("234");
  });
});
