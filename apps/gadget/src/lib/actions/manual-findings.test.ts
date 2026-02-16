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
  createManualFinding,
  deleteManualFinding,
  getManualFindingsForRepo,
  resolveManualFinding,
  unresolveManualFinding,
  updateManualFinding,
} from "./manual-findings";

const mockQueryAll = vi.mocked(queryAll);
const mockQueryOne = vi.mocked(queryOne);
const mockExecute = vi.mocked(execute);
const mockBuildUpdate = vi.mocked(buildUpdate);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("getManualFindingsForRepo", () => {
  it("returns findings sorted by severity", async () => {
    mockQueryAll.mockResolvedValue([
      { id: "1", severity: "critical", title: "Critical issue", suggested_actions: "[]" },
      { id: "2", severity: "warning", title: "Warning issue", suggested_actions: '["Fix it"]' },
    ]);

    const result = await getManualFindingsForRepo("repo-1");
    expect(result).toHaveLength(2);
    expect(result[0].suggested_actions).toEqual([]);
    expect(result[1].suggested_actions).toEqual(["Fix it"]);
  });
});

describe("createManualFinding", () => {
  it("creates a finding with defaults", async () => {
    mockExecute.mockResolvedValue(undefined);
    mockQueryOne.mockResolvedValue({
      id: "test-id",
      repo_id: "repo-1",
      title: "New Finding",
      severity: "warning",
      category: "custom",
      suggested_actions: "[]",
    });

    const result = await createManualFinding({
      repo_id: "repo-1",
      title: "New Finding",
    });

    expect(result.title).toBe("New Finding");
    expect(mockExecute).toHaveBeenCalledWith(
      {},
      expect.stringContaining("INSERT INTO manual_findings"),
      expect.arrayContaining(["test-id", "repo-1", "custom", "warning", "New Finding"]),
    );
  });

  it("creates a finding with all fields", async () => {
    mockExecute.mockResolvedValue(undefined);
    mockQueryOne.mockResolvedValue({
      id: "test-id",
      repo_id: "repo-1",
      title: "Security Issue",
      severity: "critical",
      category: "security",
      suggested_actions: '["Patch now"]',
    });

    const result = await createManualFinding({
      repo_id: "repo-1",
      title: "Security Issue",
      category: "security",
      severity: "critical",
      details: "Found vulnerability",
      evidence: "CVE-2024-0001",
      suggested_actions: ["Patch now"],
      created_by: "user-1",
    });

    expect(result.title).toBe("Security Issue");
  });

  it("throws when creation fails", async () => {
    mockExecute.mockResolvedValue(undefined);
    mockQueryOne.mockResolvedValue(undefined);

    await expect(createManualFinding({ repo_id: "repo-1", title: "Fail" })).rejects.toThrow(
      "Failed to create manual finding",
    );
  });
});

describe("updateManualFinding", () => {
  it("updates a finding using buildUpdate", async () => {
    mockBuildUpdate.mockReturnValue({
      sql: "UPDATE manual_findings SET title = ? WHERE id = ?",
      params: ["Updated Title", "finding-1"],
    });
    mockExecute.mockResolvedValue(undefined);
    mockQueryOne.mockResolvedValue({
      id: "finding-1",
      title: "Updated Title",
      suggested_actions: "[]",
    });

    const result = await updateManualFinding("finding-1", { title: "Updated Title" });
    expect(result).not.toBeNull();
    expect(result?.title).toBe("Updated Title");
  });

  it("returns null when finding not found", async () => {
    mockBuildUpdate.mockReturnValue(null);
    mockQueryOne.mockResolvedValue(undefined);

    const result = await updateManualFinding("nonexistent", { title: "New" });
    expect(result).toBeNull();
  });
});

describe("deleteManualFinding", () => {
  it("deletes a finding by id", async () => {
    mockExecute.mockResolvedValue(undefined);

    await deleteManualFinding("finding-1");
    expect(mockExecute).toHaveBeenCalledWith({}, "DELETE FROM manual_findings WHERE id = ?", ["finding-1"]);
  });
});

describe("resolveManualFinding", () => {
  it("marks a finding as resolved", async () => {
    mockExecute.mockResolvedValue(undefined);

    await resolveManualFinding("finding-1");
    expect(mockExecute).toHaveBeenCalledWith(
      {},
      "UPDATE manual_findings SET is_resolved = true, resolved_at = ?, updated_at = ? WHERE id = ?",
      ["2024-01-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z", "finding-1"],
    );
  });
});

describe("unresolveManualFinding", () => {
  it("marks a finding as unresolved", async () => {
    mockExecute.mockResolvedValue(undefined);

    await unresolveManualFinding("finding-1");
    expect(mockExecute).toHaveBeenCalledWith(
      {},
      "UPDATE manual_findings SET is_resolved = false, resolved_at = NULL, updated_at = ? WHERE id = ?",
      ["2024-01-01T00:00:00.000Z", "finding-1"],
    );
  });
});
