import { describe, expect, it } from "vitest";

import { sessionRunners } from "./index";

describe("session-runners/index", () => {
  const expectedTypes = [
    "quick_improve",
    "finding_fix",
    "fix_apply",
    "scan",
    "ai_file_gen",
    "cleanup",
    "toolbox_command",
  ];

  it("registers all 7 session types", () => {
    expect(Object.keys(sessionRunners)).toHaveLength(7);
  });

  for (const type of expectedTypes) {
    it(`has runner factory for '${type}'`, () => {
      expect(sessionRunners[type as keyof typeof sessionRunners]).toBeDefined();
      expect(typeof sessionRunners[type as keyof typeof sessionRunners]).toBe("function");
    });
  }
});
