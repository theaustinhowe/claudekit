import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  },
}));

import fs from "node:fs";
import type { CustomRule } from "@/lib/types";
import { auditCustomRules } from "./custom-rules";

const mockExistsSync = vi.mocked(fs.existsSync);
const mockReadFileSync = vi.mocked(fs.readFileSync);

function makeRule(overrides: Partial<CustomRule> = {}): CustomRule {
  return {
    id: "r1",
    policy_id: "p1",
    name: "Test Rule",
    description: "A test rule",
    rule_type: "file_exists",
    category: "custom",
    severity: "warning",
    config: {},
    suggested_actions: ["Fix it"],
    is_enabled: true,
    created_at: "",
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("auditCustomRules", () => {
  it("skips disabled rules", () => {
    const rule = makeRule({ is_enabled: false });
    const findings = auditCustomRules("/repo", [rule]);
    expect(findings).toHaveLength(0);
  });

  it("returns empty for unknown rule type", () => {
    const rule = makeRule({ rule_type: "unknown" as CustomRule["rule_type"] });
    const findings = auditCustomRules("/repo", [rule]);
    expect(findings).toHaveLength(0);
  });

  describe("file_exists", () => {
    it("produces a finding when none of the paths exist", () => {
      mockExistsSync.mockReturnValue(false);
      const rule = makeRule({
        rule_type: "file_exists",
        config: { paths: ["LICENSE", "LICENSE.md"] },
      });
      const findings = auditCustomRules("/repo", [rule]);
      expect(findings).toHaveLength(1);
      expect(findings[0].title).toBe("Test Rule");
    });

    it("produces no finding when at least one path exists", () => {
      mockExistsSync.mockImplementation((p: unknown) => {
        const path = p as string;
        return path.endsWith("LICENSE.md");
      });
      const rule = makeRule({
        rule_type: "file_exists",
        config: { paths: ["LICENSE", "LICENSE.md"] },
      });
      const findings = auditCustomRules("/repo", [rule]);
      expect(findings).toHaveLength(0);
    });

    it("returns null when paths array is empty", () => {
      const rule = makeRule({ rule_type: "file_exists", config: { paths: [] } });
      const findings = auditCustomRules("/repo", [rule]);
      expect(findings).toHaveLength(0);
    });
  });

  describe("file_missing", () => {
    it("produces a finding when the file exists (should be missing)", () => {
      mockExistsSync.mockReturnValue(true);
      const rule = makeRule({
        rule_type: "file_missing",
        config: { path: ".env" },
      });
      const findings = auditCustomRules("/repo", [rule]);
      expect(findings).toHaveLength(1);
      expect(findings[0].title).toBe("Test Rule");
    });

    it("produces no finding when the file does not exist", () => {
      mockExistsSync.mockReturnValue(false);
      const rule = makeRule({
        rule_type: "file_missing",
        config: { path: ".env" },
      });
      const findings = auditCustomRules("/repo", [rule]);
      expect(findings).toHaveLength(0);
    });

    it("returns empty when path is not specified", () => {
      const rule = makeRule({ rule_type: "file_missing", config: {} });
      const findings = auditCustomRules("/repo", [rule]);
      expect(findings).toHaveLength(0);
    });
  });

  describe("file_contains", () => {
    it("produces a finding when pattern is not found", () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue("some content without the pattern");
      const rule = makeRule({
        rule_type: "file_contains",
        config: { file: "README.md", pattern: "MIT License" },
      });
      const findings = auditCustomRules("/repo", [rule]);
      expect(findings).toHaveLength(1);
    });

    it("produces no finding when pattern is found", () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue("This project uses the MIT License");
      const rule = makeRule({
        rule_type: "file_contains",
        config: { file: "README.md", pattern: "MIT License" },
      });
      const findings = auditCustomRules("/repo", [rule]);
      expect(findings).toHaveLength(0);
    });

    it("produces a finding when negate is true and pattern is found", () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue("console.log('debug')");
      const rule = makeRule({
        rule_type: "file_contains",
        config: { file: "src/index.ts", pattern: "console\\.log", negate: true },
      });
      const findings = auditCustomRules("/repo", [rule]);
      expect(findings).toHaveLength(1);
    });

    it("produces no finding when negate is true and pattern is not found", () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue("logger.info('message')");
      const rule = makeRule({
        rule_type: "file_contains",
        config: { file: "src/index.ts", pattern: "console\\.log", negate: true },
      });
      const findings = auditCustomRules("/repo", [rule]);
      expect(findings).toHaveLength(0);
    });

    it("returns empty when file does not exist", () => {
      mockExistsSync.mockReturnValue(false);
      const rule = makeRule({
        rule_type: "file_contains",
        config: { file: "missing.txt", pattern: "something" },
      });
      const findings = auditCustomRules("/repo", [rule]);
      expect(findings).toHaveLength(0);
    });

    it("returns empty when file or pattern is not specified", () => {
      const rule = makeRule({ rule_type: "file_contains", config: {} });
      const findings = auditCustomRules("/repo", [rule]);
      expect(findings).toHaveLength(0);
    });
  });

  describe("json_field", () => {
    it("produces a finding when field value does not match expected", () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify({ compilerOptions: { strict: false } }));
      const rule = makeRule({
        rule_type: "json_field",
        config: { file: "tsconfig.json", field: "compilerOptions.strict", expected: true },
      });
      const findings = auditCustomRules("/repo", [rule]);
      expect(findings).toHaveLength(1);
    });

    it("produces no finding when field value matches expected", () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify({ compilerOptions: { strict: true } }));
      const rule = makeRule({
        rule_type: "json_field",
        config: { file: "tsconfig.json", field: "compilerOptions.strict", expected: true },
      });
      const findings = auditCustomRules("/repo", [rule]);
      expect(findings).toHaveLength(0);
    });

    it("handles deeply nested fields", () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify({ a: { b: { c: "value" } } }));
      const rule = makeRule({
        rule_type: "json_field",
        config: { file: "config.json", field: "a.b.c", expected: "value" },
      });
      const findings = auditCustomRules("/repo", [rule]);
      expect(findings).toHaveLength(0);
    });

    it("produces a finding when field path does not exist", () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify({ other: "value" }));
      const rule = makeRule({
        rule_type: "json_field",
        config: { file: "config.json", field: "a.b.c", expected: "value" },
      });
      const findings = auditCustomRules("/repo", [rule]);
      expect(findings).toHaveLength(1);
    });

    it("returns empty when file does not exist", () => {
      mockExistsSync.mockReturnValue(false);
      const rule = makeRule({
        rule_type: "json_field",
        config: { file: "missing.json", field: "x", expected: "y" },
      });
      const findings = auditCustomRules("/repo", [rule]);
      expect(findings).toHaveLength(0);
    });

    it("returns empty when file or field is not specified", () => {
      const rule = makeRule({ rule_type: "json_field", config: {} });
      const findings = auditCustomRules("/repo", [rule]);
      expect(findings).toHaveLength(0);
    });

    it("handles invalid JSON gracefully", () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue("not json");
      const rule = makeRule({
        rule_type: "json_field",
        config: { file: "config.json", field: "x", expected: "y" },
      });
      const findings = auditCustomRules("/repo", [rule]);
      expect(findings).toHaveLength(0);
    });
  });

  it("processes multiple rules and collects all findings", () => {
    mockExistsSync.mockReturnValue(false);
    const rules = [
      makeRule({ id: "r1", name: "Rule 1", rule_type: "file_exists", config: { paths: ["A"] } }),
      makeRule({ id: "r2", name: "Rule 2", rule_type: "file_exists", config: { paths: ["B"] } }),
    ];
    const findings = auditCustomRules("/repo", rules);
    expect(findings).toHaveLength(2);
  });

  it("skips rules that throw during evaluation", () => {
    mockExistsSync.mockImplementation(() => {
      throw new Error("read error");
    });
    const rule = makeRule({ rule_type: "file_exists", config: { paths: ["A"] } });
    const findings = auditCustomRules("/repo", [rule]);
    expect(findings).toHaveLength(0);
  });
});
