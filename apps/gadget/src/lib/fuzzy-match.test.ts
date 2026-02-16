import { describe, expect, it } from "vitest";
import { fuzzyMatch } from "@/lib/fuzzy-match";

describe("fuzzyMatch", () => {
  it("matches exact string", () => {
    const result = fuzzyMatch("hello", "hello");
    expect(result.matches).toBe(true);
    expect(result.indices).toEqual([0, 1, 2, 3, 4]);
  });

  it("matches substring characters in order", () => {
    const result = fuzzyMatch("abc", "aXbXc");
    expect(result.matches).toBe(true);
    expect(result.indices).toEqual([0, 2, 4]);
  });

  it("returns false when characters are not all present", () => {
    const result = fuzzyMatch("xyz", "xay");
    expect(result.matches).toBe(false);
  });

  it("returns false when characters cannot be matched in order", () => {
    const result = fuzzyMatch("ba", "ab");
    expect(result.matches).toBe(false);
  });

  it("is case insensitive", () => {
    const result = fuzzyMatch("ABC", "abc");
    expect(result.matches).toBe(true);
  });

  it("handles empty query", () => {
    const result = fuzzyMatch("", "anything");
    expect(result.matches).toBe(true);
    expect(result.indices).toEqual([]);
  });

  it("handles empty target", () => {
    const result = fuzzyMatch("a", "");
    expect(result.matches).toBe(false);
  });

  it("gives bonus for consecutive matches", () => {
    const consecutive = fuzzyMatch("ab", "ab");
    const spaced = fuzzyMatch("ab", "aXb");
    expect(consecutive.score).toBeGreaterThan(spaced.score);
  });

  it("gives bonus for boundary matches after /", () => {
    const boundary = fuzzyMatch("s", "path/src");
    const mid = fuzzyMatch("a", "path/src");
    expect(boundary.score).toBeGreaterThan(mid.score);
  });

  it("gives bonus for match at start of string", () => {
    const result = fuzzyMatch("a", "abc");
    expect(result.score).toBe(4);
  });

  it("gives bonus for boundary matches after .", () => {
    const result = fuzzyMatch("t", "file.ts");
    expect(result.score).toBe(4);
  });

  it("gives bonus for boundary matches after -", () => {
    const result = fuzzyMatch("m", "fuzzy-match");
    expect(result.score).toBe(4);
  });

  it("gives bonus for boundary matches after _", () => {
    const result = fuzzyMatch("b", "snake_bar");
    expect(result.score).toBe(4);
  });

  it("accumulates score from consecutive + boundary bonuses", () => {
    const result = fuzzyMatch("src", "src/index.ts");
    expect(result.matches).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(9);
  });

  it("handles single character query", () => {
    const result = fuzzyMatch("x", "axb");
    expect(result.matches).toBe(true);
    expect(result.indices).toEqual([1]);
  });

  it("matches file paths naturally", () => {
    const result = fuzzyMatch("uts", "src/lib/utils.test.ts");
    expect(result.matches).toBe(true);
  });
});
