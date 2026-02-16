import { describe, expect, it } from "vitest";

import { sessionRunners } from "./index";

describe("session-runners/index", () => {
  const expectedTypes = [
    "quick_improve",
    "finding_fix",
    "chat",
    "scaffold",
    "upgrade",
    "auto_fix",
    "fix_apply",
    "scan",
    "upgrade_init",
    "ai_file_gen",
    "cleanup",
    "toolbox_command",
  ];

  it("registers all 12 session types", () => {
    expect(Object.keys(sessionRunners)).toHaveLength(12);
  });

  for (const type of expectedTypes) {
    it(`has runner factory for '${type}'`, () => {
      expect(sessionRunners[type as keyof typeof sessionRunners]).toBeDefined();
      expect(typeof sessionRunners[type as keyof typeof sessionRunners]).toBe("function");
    });
  }
});
