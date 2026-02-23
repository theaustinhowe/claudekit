import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(() => ({})),
  queryAll: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
  buildUpdate: vi.fn(),
}));
vi.mock("@/lib/utils", () => ({
  generateId: vi.fn(() => "mock-policy-id"),
  parsePolicy: vi.fn((row: Record<string, unknown>) => ({
    ...row,
    expected_versions: JSON.parse((row.expected_versions as string) || "{}"),
    banned_dependencies: JSON.parse((row.banned_dependencies as string) || "[]"),
    allowed_package_managers: JSON.parse((row.allowed_package_managers as string) || "[]"),
    ignore_patterns: JSON.parse((row.ignore_patterns as string) || "[]"),
    repo_types: JSON.parse((row.repo_types as string) || "[]"),
  })),
}));

import { buildUpdate, execute, queryAll, queryOne } from "@/lib/db";
import { createPolicy, deletePolicy, getPolicies, updatePolicy } from "./policies";

const mockQueryAll = vi.mocked(queryAll);
const mockQueryOne = vi.mocked(queryOne);
const mockExecute = vi.mocked(execute);
const mockBuildUpdate = vi.mocked(buildUpdate);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("getPolicies", () => {
  it("returns parsed policies", async () => {
    mockQueryAll.mockResolvedValue([
      {
        id: "p1",
        name: "Default",
        is_builtin: true,
        expected_versions: "{}",
        banned_dependencies: "[]",
        allowed_package_managers: "[]",
        ignore_patterns: "[]",

        repo_types: "[]",
      },
    ]);

    const result = await getPolicies();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Default");
    expect(result[0].expected_versions).toEqual({});
  });

  it("returns empty array when no policies exist", async () => {
    mockQueryAll.mockResolvedValue([]);
    const result = await getPolicies();
    expect(result).toEqual([]);
  });
});

describe("createPolicy", () => {
  it("creates a policy and returns it", async () => {
    mockExecute.mockResolvedValue(undefined);
    mockQueryOne.mockResolvedValue({
      id: "mock-policy-id",
      name: "Custom Policy",
      description: "My policy",
      is_builtin: false,
      expected_versions: '{"react": "^18.0.0"}',
      banned_dependencies: "[]",
      allowed_package_managers: '["pnpm"]',
      ignore_patterns: "[]",
      repo_types: "[]",
    });

    const result = await createPolicy({
      name: "Custom Policy",
      description: "My policy",
      expected_versions: { react: "^18.0.0" },
      allowed_package_managers: ["pnpm"],
    });

    expect(result.name).toBe("Custom Policy");
    expect(mockExecute).toHaveBeenCalledWith(
      {},
      expect.stringContaining("INSERT INTO policies"),
      expect.arrayContaining(["mock-policy-id", "Custom Policy"]),
    );
  });

  it("throws when created policy cannot be fetched", async () => {
    mockExecute.mockResolvedValue(undefined);
    mockQueryOne.mockResolvedValue(undefined);

    await expect(createPolicy({ name: "Broken" })).rejects.toThrow("Failed to create policy");
  });

  it("uses default values for optional fields", async () => {
    mockExecute.mockResolvedValue(undefined);
    mockQueryOne.mockResolvedValue({
      id: "mock-policy-id",
      name: "Minimal",
      description: null,
      is_builtin: false,
      expected_versions: "{}",
      banned_dependencies: "[]",
      allowed_package_managers: "[]",
      ignore_patterns: "[]",

      repo_types: "[]",
    });

    const result = await createPolicy({ name: "Minimal" });
    expect(result.name).toBe("Minimal");
    expect(mockExecute).toHaveBeenCalledWith(
      {},
      expect.stringContaining("INSERT INTO policies"),
      expect.arrayContaining(["mock-policy-id", "Minimal", null]),
    );
  });
});

describe("updatePolicy", () => {
  it("updates a policy when it exists", async () => {
    mockQueryOne
      .mockResolvedValueOnce({
        id: "p1",
        name: "Existing",
        expected_versions: "{}",
        banned_dependencies: "[]",
        allowed_package_managers: "[]",
        ignore_patterns: "[]",

        repo_types: "[]",
      })
      .mockResolvedValueOnce({
        id: "p1",
        name: "Updated",
        expected_versions: "{}",
        banned_dependencies: "[]",
        allowed_package_managers: "[]",
        ignore_patterns: "[]",

        repo_types: "[]",
      });

    mockBuildUpdate.mockReturnValue({ sql: "UPDATE policies SET name = ? WHERE id = ?", params: ["Updated", "p1"] });
    mockExecute.mockResolvedValue(undefined);

    const result = await updatePolicy("p1", { name: "Updated" });
    expect(result).toBeDefined();
    expect(result?.name).toBe("Updated");
    expect(mockExecute).toHaveBeenCalledWith({}, "UPDATE policies SET name = ? WHERE id = ?", ["Updated", "p1"]);
  });

  it("returns null when policy does not exist", async () => {
    mockQueryOne.mockResolvedValue(undefined);
    const result = await updatePolicy("nonexistent", { name: "Test" });
    expect(result).toBeNull();
  });

  it("skips update when buildUpdate returns null", async () => {
    mockQueryOne
      .mockResolvedValueOnce({
        id: "p1",
        name: "Existing",
        expected_versions: "{}",
        banned_dependencies: "[]",
        allowed_package_managers: "[]",
        ignore_patterns: "[]",

        repo_types: "[]",
      })
      .mockResolvedValueOnce({
        id: "p1",
        name: "Existing",
        expected_versions: "{}",
        banned_dependencies: "[]",
        allowed_package_managers: "[]",
        ignore_patterns: "[]",

        repo_types: "[]",
      });

    mockBuildUpdate.mockReturnValue(null as never);

    const result = await updatePolicy("p1", {});
    expect(result).toBeDefined();
    expect(mockExecute).not.toHaveBeenCalled();
  });
});

describe("deletePolicy", () => {
  it("deletes a non-builtin policy", async () => {
    mockExecute.mockResolvedValue(undefined);

    await deletePolicy("p1");
    expect(mockExecute).toHaveBeenCalledWith({}, "DELETE FROM policies WHERE id = ? AND is_builtin = false", ["p1"]);
  });
});
