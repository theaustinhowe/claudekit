import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(() => ({})),
  queryAll: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
  buildUpdate: vi.fn(),
  parseJsonField: vi.fn((val, fallback) => {
    if (val === null || val === undefined) return fallback;
    if (typeof val === "string") {
      try {
        return JSON.parse(val);
      } catch {
        return fallback;
      }
    }
    return val;
  }),
}));
vi.mock("@/lib/utils", () => ({
  generateId: vi.fn(() => "test-id"),
  nowTimestamp: vi.fn(() => "2024-01-01T00:00:00.000Z"),
}));

import { buildUpdate, execute, queryAll, queryOne } from "@/lib/db";
import {
  createCustomRule,
  deleteCustomRule,
  getCustomRules,
  getEnabledRulesForPolicy,
  toggleCustomRule,
  updateCustomRule,
} from "./custom-rules";

const mockQueryAll = vi.mocked(queryAll);
const mockQueryOne = vi.mocked(queryOne);
const mockExecute = vi.mocked(execute);
const mockBuildUpdate = vi.mocked(buildUpdate);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("getCustomRules", () => {
  it("returns all rules when no policyId", async () => {
    mockQueryAll.mockResolvedValue([{ id: "1", name: "Rule 1", config: "{}", suggested_actions: "[]" }]);

    const result = await getCustomRules();
    expect(result).toHaveLength(1);
    expect(result[0].config).toEqual({});
    expect(result[0].suggested_actions).toEqual([]);
    expect(mockQueryAll).toHaveBeenCalledWith({}, "SELECT * FROM custom_rules ORDER BY is_builtin DESC, name ASC");
  });

  it("returns rules filtered by policyId", async () => {
    mockQueryAll.mockResolvedValue([]);

    await getCustomRules("policy-1");
    expect(mockQueryAll).toHaveBeenCalledWith(
      {},
      "SELECT * FROM custom_rules WHERE policy_id = ? OR policy_id IS NULL ORDER BY is_builtin DESC, name ASC",
      ["policy-1"],
    );
  });
});

describe("getEnabledRulesForPolicy", () => {
  it("returns only enabled rules for policy", async () => {
    mockQueryAll.mockResolvedValue([
      { id: "1", name: "Enabled Rule", config: "{}", suggested_actions: "[]", is_enabled: true },
    ]);

    const result = await getEnabledRulesForPolicy("policy-1");
    expect(result).toHaveLength(1);
    expect(mockQueryAll).toHaveBeenCalledWith(
      {},
      "SELECT * FROM custom_rules WHERE is_enabled = true AND (policy_id = ? OR policy_id IS NULL) ORDER BY name ASC",
      ["policy-1"],
    );
  });
});

describe("createCustomRule", () => {
  it("creates a rule with defaults", async () => {
    mockExecute.mockResolvedValue(undefined);
    mockQueryOne.mockResolvedValue({
      id: "test-id",
      name: "My Rule",
      config: "{}",
      suggested_actions: "[]",
      category: "custom",
      severity: "warning",
      rule_type: "regex",
    });

    const result = await createCustomRule({
      name: "My Rule",
      rule_type: "regex",
      config: {},
    });

    expect(result.name).toBe("My Rule");
    expect(mockExecute).toHaveBeenCalledWith(
      {},
      expect.stringContaining("INSERT INTO custom_rules"),
      expect.arrayContaining(["test-id", "My Rule"]),
    );
  });

  it("creates a rule with all fields", async () => {
    mockExecute.mockResolvedValue(undefined);
    mockQueryOne.mockResolvedValue({
      id: "test-id",
      name: "Full Rule",
      config: '{"pattern":"test"}',
      suggested_actions: '["Fix it"]',
      category: "security",
      severity: "critical",
      rule_type: "regex",
      policy_id: "policy-1",
    });

    const result = await createCustomRule({
      name: "Full Rule",
      description: "A full rule",
      category: "security",
      severity: "critical",
      rule_type: "regex",
      config: { pattern: "test" },
      suggested_actions: ["Fix it"],
      policy_id: "policy-1",
    });

    expect(result.name).toBe("Full Rule");
  });

  it("throws when creation fails", async () => {
    mockExecute.mockResolvedValue(undefined);
    mockQueryOne.mockResolvedValue(undefined);

    await expect(createCustomRule({ name: "Fail", rule_type: "regex", config: {} })).rejects.toThrow(
      "Failed to create custom rule",
    );
  });
});

describe("updateCustomRule", () => {
  it("updates a rule using buildUpdate", async () => {
    mockBuildUpdate.mockReturnValue({
      sql: "UPDATE custom_rules SET name = ? WHERE id = ?",
      params: ["New Name", "rule-1"],
    });
    mockExecute.mockResolvedValue(undefined);
    mockQueryOne.mockResolvedValue({
      id: "rule-1",
      name: "New Name",
      config: "{}",
      suggested_actions: "[]",
    });

    const result = await updateCustomRule("rule-1", { name: "New Name" });
    expect(result).not.toBeNull();
    expect(result?.name).toBe("New Name");
  });

  it("returns null when rule not found", async () => {
    mockBuildUpdate.mockReturnValue(null);
    mockQueryOne.mockResolvedValue(undefined);

    const result = await updateCustomRule("nonexistent", { name: "New" });
    expect(result).toBeNull();
  });
});

describe("deleteCustomRule", () => {
  it("deletes a non-builtin rule", async () => {
    mockExecute.mockResolvedValue(undefined);

    await deleteCustomRule("rule-1");
    expect(mockExecute).toHaveBeenCalledWith({}, "DELETE FROM custom_rules WHERE id = ? AND is_builtin = false", [
      "rule-1",
    ]);
  });
});

describe("toggleCustomRule", () => {
  it("toggles rule enabled state", async () => {
    mockExecute.mockResolvedValue(undefined);

    await toggleCustomRule("rule-1", true);
    expect(mockExecute).toHaveBeenCalledWith(
      {},
      "UPDATE custom_rules SET is_enabled = ?, updated_at = ? WHERE id = ?",
      [true, "2024-01-01T00:00:00.000Z", "rule-1"],
    );
  });
});
