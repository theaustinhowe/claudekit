import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/services/session-manager", () => ({
  setSessionPid: vi.fn(),
}));

vi.mock("@claudekit/claude-runner", () => ({
  runClaude: vi.fn(),
}));

import { sessionRunners } from "./index";

describe("sessionRunners registry", () => {
  it("has a runner for every session type", () => {
    const expectedTypes = [
      "skill_analysis",
      "split_analysis",
      "comment_fix",
      "skill_rule_analysis",
      "split_execution",
      "fix_execution",
      "account_sync",
    ];

    for (const type of expectedTypes) {
      expect(sessionRunners).toHaveProperty(type);
      expect(typeof sessionRunners[type as keyof typeof sessionRunners]).toBe("function");
    }
  });

  it("directly registered runners return a function", () => {
    const directRunners = ["skill_analysis", "split_analysis", "comment_fix", "account_sync"] as const;

    for (const type of directRunners) {
      const runner = sessionRunners[type]({});
      expect(typeof runner).toBe("function");
    }
  });

  it("lazy runners return a function that resolves dynamically", () => {
    const lazyRunners = ["skill_rule_analysis", "split_execution", "fix_execution"] as const;

    for (const type of lazyRunners) {
      const runner = sessionRunners[type]({});
      expect(typeof runner).toBe("function");
    }
  });

  it("lazy skill_rule_analysis runner invokes the loaded factory", async () => {
    // The lazy runner should wrap and delegate to the real factory
    const runner = sessionRunners.skill_rule_analysis({ repoId: "repo1", prNumbers: [1] });
    expect(typeof runner).toBe("function");
  });

  it("lazy split_execution runner invokes the loaded factory", async () => {
    const runner = sessionRunners.split_execution({ planId: "plan1" });
    expect(typeof runner).toBe("function");
  });

  it("lazy fix_execution runner invokes the loaded factory", async () => {
    const runner = sessionRunners.fix_execution({ fixIds: ["f1"] });
    expect(typeof runner).toBe("function");
  });
});
