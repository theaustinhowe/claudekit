import { describe, expect, it } from "vitest";
import { classifyPRSize, SIZE_THRESHOLDS } from "./constants";

describe("classifyPRSize", () => {
  it("returns S for lines below S threshold", () => {
    expect(classifyPRSize(0)).toBe("S");
    expect(classifyPRSize(50)).toBe("S");
    expect(classifyPRSize(99)).toBe("S");
  });

  it("returns M at S threshold boundary", () => {
    expect(classifyPRSize(SIZE_THRESHOLDS.S)).toBe("M");
    expect(classifyPRSize(100)).toBe("M");
  });

  it("returns M for lines between S and M thresholds", () => {
    expect(classifyPRSize(250)).toBe("M");
    expect(classifyPRSize(499)).toBe("M");
  });

  it("returns L at M threshold boundary", () => {
    expect(classifyPRSize(SIZE_THRESHOLDS.M)).toBe("L");
    expect(classifyPRSize(500)).toBe("L");
  });

  it("returns L for lines between M and L thresholds", () => {
    expect(classifyPRSize(750)).toBe("L");
    expect(classifyPRSize(999)).toBe("L");
  });

  it("returns XL at L threshold boundary", () => {
    expect(classifyPRSize(SIZE_THRESHOLDS.L)).toBe("XL");
    expect(classifyPRSize(1000)).toBe("XL");
  });

  it("returns XL for very large PRs", () => {
    expect(classifyPRSize(5000)).toBe("XL");
    expect(classifyPRSize(100000)).toBe("XL");
  });
});
