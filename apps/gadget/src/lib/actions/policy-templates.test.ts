import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(() => ({})),
  queryAll: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
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

import { execute, queryAll, queryOne } from "@/lib/db";
import { createPolicyTemplate, deletePolicyTemplate, getPolicyTemplates } from "./policy-templates";

const mockQueryAll = vi.mocked(queryAll);
const mockQueryOne = vi.mocked(queryOne);
const mockExecute = vi.mocked(execute);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("getPolicyTemplates", () => {
  it("returns parsed policy templates", async () => {
    mockQueryAll.mockResolvedValue([
      { id: "1", name: "Template 1", defaults: '{"key":"val"}', is_builtin: true },
      { id: "2", name: "Template 2", defaults: "{}", is_builtin: false },
    ]);

    const result = await getPolicyTemplates();
    expect(result).toHaveLength(2);
    expect(result[0].defaults).toEqual({ key: "val" });
  });
});

describe("createPolicyTemplate", () => {
  it("creates a template with defaults", async () => {
    mockExecute.mockResolvedValue(undefined);
    mockQueryOne.mockResolvedValue({
      id: "test-id",
      name: "My Template",
      description: null,
      icon: null,
      defaults: "{}",
      category: null,
      is_builtin: false,
      created_at: "2024-01-01T00:00:00.000Z",
      updated_at: "2024-01-01T00:00:00.000Z",
    });

    const result = await createPolicyTemplate({ name: "My Template" });
    expect(result.name).toBe("My Template");
    expect(mockExecute).toHaveBeenCalledWith(
      {},
      expect.stringContaining("INSERT INTO policy_templates"),
      expect.arrayContaining(["test-id", "My Template"]),
    );
  });

  it("creates a template with all fields", async () => {
    mockExecute.mockResolvedValue(undefined);
    mockQueryOne.mockResolvedValue({
      id: "test-id",
      name: "Full Template",
      description: "A template",
      icon: "star",
      defaults: '{"strict":true}',
      category: "security",
      is_builtin: false,
    });

    const result = await createPolicyTemplate({
      name: "Full Template",
      description: "A template",
      icon: "star",
      defaults: { strict: true },
      category: "security",
    });
    expect(result.name).toBe("Full Template");
  });

  it("throws when template creation fails", async () => {
    mockExecute.mockResolvedValue(undefined);
    mockQueryOne.mockResolvedValue(undefined);

    await expect(createPolicyTemplate({ name: "Fail" })).rejects.toThrow("Failed to create policy template");
  });
});

describe("deletePolicyTemplate", () => {
  it("deletes a non-builtin template", async () => {
    mockExecute.mockResolvedValue(undefined);

    await deletePolicyTemplate("tmpl-1");
    expect(mockExecute).toHaveBeenCalledWith({}, "DELETE FROM policy_templates WHERE id = ? AND is_builtin = false", [
      "tmpl-1",
    ]);
  });
});
