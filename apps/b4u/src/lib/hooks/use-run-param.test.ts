import { describe, expect, it } from "vitest";

describe("useRunParam", () => {
  it("exports useRunParam as a function", async () => {
    const mod = await import("./use-run-param");
    expect(typeof mod.useRunParam).toBe("function");
  });
});
