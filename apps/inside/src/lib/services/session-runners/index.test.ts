import { describe, expect, it } from "vitest";
import { sessionRunners } from "./index";

describe("sessionRunners", () => {
  it("exports all five session types", () => {
    expect(Object.keys(sessionRunners).sort()).toEqual(["auto_fix", "chat", "scaffold", "upgrade", "upgrade_init"]);
  });

  it("each entry is a function", () => {
    for (const key of Object.keys(sessionRunners)) {
      expect(typeof sessionRunners[key as keyof typeof sessionRunners]).toBe("function");
    }
  });
});
