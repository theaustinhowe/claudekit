import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(() => ({})),
}));
vi.mock("@/lib/db/helpers", () => ({
  queryAll: vi.fn(),
  execute: vi.fn(),
}));
vi.mock("@/lib/utils", () => ({
  generateId: vi.fn(() => "mock-id"),
}));
vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  },
}));

import fs from "node:fs";
import { execute, queryAll } from "@/lib/db/helpers";
import { planFixes, storePlannedFixes } from "./fix-planner";

const mockQueryAll = vi.mocked(queryAll);
const mockExecute = vi.mocked(execute);
const mockExistsSync = vi.mocked(fs.existsSync);
const mockReadFileSync = vi.mocked(fs.readFileSync);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("planFixes", () => {
  it("plans a fix for missing README", async () => {
    mockQueryAll.mockResolvedValue([
      {
        id: "f1",
        repo_id: "repo1",
        scan_id: "scan1",
        category: "ai-files",
        severity: "warning",
        title: "Missing: README",
        details: "README not found",
        evidence: null,
        suggested_actions: "[]",
        created_at: "2024-01-01",
      },
    ]);

    const plans = await planFixes("repo1", "/repo", "my-app", "scan1");
    expect(plans).toHaveLength(1);
    expect(plans[0].action.title).toBe("Create README.md");
    expect(plans[0].action.risk).toBe("low");
    expect(plans[0].action.diff_after).toContain("# my-app");
  });

  it("plans a fix for missing CLAUDE.md", async () => {
    mockQueryAll.mockResolvedValue([
      {
        id: "f1",
        repo_id: "repo1",
        scan_id: "scan1",
        category: "ai-files",
        severity: "warning",
        title: "Missing: CLAUDE.md",
        details: "CLAUDE.md not found",
        evidence: null,
        suggested_actions: "[]",
        created_at: "2024-01-01",
      },
    ]);

    const plans = await planFixes("repo1", "/repo", "my-app");
    expect(plans).toHaveLength(1);
    expect(plans[0].action.title).toBe("Create CLAUDE.md");
    expect(plans[0].action.diff_after).toContain("# my-app");
  });

  it("plans a fix for missing CONTRIBUTING", async () => {
    mockQueryAll.mockResolvedValue([
      {
        id: "f1",
        repo_id: "repo1",
        scan_id: null,
        category: "ai-files",
        severity: "warning",
        title: "Missing: CONTRIBUTING",
        details: "CONTRIBUTING not found",
        evidence: null,
        suggested_actions: "[]",
        created_at: "2024-01-01",
      },
    ]);

    const plans = await planFixes("repo1", "/repo", "my-app");
    expect(plans).toHaveLength(1);
    expect(plans[0].action.title).toBe("Create CONTRIBUTING.md");
    expect(plans[0].action.diff_after).toContain("# Contributing");
  });

  it("plans a fix for banned dependency removal", async () => {
    mockQueryAll.mockResolvedValue([
      {
        id: "f1",
        repo_id: "repo1",
        scan_id: "scan1",
        category: "dependencies",
        severity: "critical",
        title: "Banned dependency: moment",
        details: "Use date-fns",
        evidence: null,
        suggested_actions: '["Remove moment", "Replace with date-fns"]',
        created_at: "2024-01-01",
      },
    ]);
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({ dependencies: { moment: "^2.29.0", react: "^18.0.0" } }));

    const plans = await planFixes("repo1", "/repo", "my-app", "scan1");
    expect(plans).toHaveLength(1);
    expect(plans[0].action.title).toBe("Remove banned dependency: moment");
    expect(plans[0].action.risk).toBe("medium");
    const diffAfter = JSON.parse(plans[0].action.diff_after as string);
    expect(diffAfter.dependencies.moment).toBeUndefined();
    expect(diffAfter.dependencies["date-fns"]).toBe("latest");
  });

  it("plans a fix for missing script", async () => {
    mockQueryAll.mockResolvedValue([
      {
        id: "f1",
        repo_id: "repo1",
        scan_id: "scan1",
        category: "structure",
        severity: "warning",
        title: "Missing script: test",
        details: 'No "test" script defined',
        evidence: null,
        suggested_actions: "[]",
        created_at: "2024-01-01",
      },
    ]);
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({ scripts: { dev: "next dev" } }));

    const plans = await planFixes("repo1", "/repo", "my-app", "scan1");
    expect(plans).toHaveLength(1);
    expect(plans[0].action.title).toBe('Add "test" script');
    const diffAfter = JSON.parse(plans[0].action.diff_after as string);
    expect(diffAfter.scripts.test).toBeDefined();
  });

  it("plans a fix for missing workspace package.json", async () => {
    mockQueryAll.mockResolvedValue([
      {
        id: "f1",
        repo_id: "repo1",
        scan_id: "scan1",
        category: "structure",
        severity: "warning",
        title: "Missing package.json in workspace: utils",
        details: "Workspace package utils has no package.json",
        evidence: null,
        suggested_actions: "[]",
        created_at: "2024-01-01",
      },
    ]);
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({ name: "@myorg/root" }));

    const plans = await planFixes("repo1", "/repo", "my-app", "scan1");
    expect(plans).toHaveLength(1);
    expect(plans[0].action.title).toBe("Create package.json for workspace: utils");
    expect(plans[0].action.diff_file).toBe("packages/utils/package.json");
    const diffAfter = JSON.parse(plans[0].action.diff_after as string);
    expect(diffAfter.name).toBe("@myorg/utils");
  });

  it("returns empty when no findings match", async () => {
    mockQueryAll.mockResolvedValue([
      {
        id: "f1",
        repo_id: "repo1",
        scan_id: "scan1",
        category: "ai-files",
        severity: "info",
        title: "Minimal content: CLAUDE.md",
        details: "CLAUDE.md has little content",
        evidence: null,
        suggested_actions: "[]",
        created_at: "2024-01-01",
      },
    ]);

    const plans = await planFixes("repo1", "/repo", "my-app", "scan1");
    expect(plans).toHaveLength(0);
  });

  it("returns empty when there are no findings at all", async () => {
    mockQueryAll.mockResolvedValue([]);
    const plans = await planFixes("repo1", "/repo", "my-app");
    expect(plans).toHaveLength(0);
  });
});

describe("storePlannedFixes", () => {
  it("stores plans in a transaction", async () => {
    mockExecute.mockResolvedValue(undefined);

    const plans = [
      {
        finding: {
          id: "f1",
          repo_id: "repo1",
          scan_id: "scan1",
          category: "ai-files" as const,
          severity: "warning" as const,
          title: "Missing: README",
          details: "Not found",
          evidence: null,
          suggested_actions: [],
          created_at: "2024-01-01",
        },
        action: {
          repo_id: "repo1",
          finding_id: "f1",
          scan_id: "scan1" as string | null,
          title: "Create README.md",
          description: "Generate README",
          impact: "docs",
          risk: "low",
          requires_approval: false,
          diff_file: "README.md",
          diff_before: null,
          diff_after: "# My App",
        },
      },
    ];

    await storePlannedFixes(plans, "repo1", "scan1");

    expect(mockExecute).toHaveBeenCalledWith({}, "BEGIN TRANSACTION");
    expect(mockExecute).toHaveBeenCalledWith({}, "DELETE FROM fix_actions WHERE repo_id = ? AND scan_id = ?", [
      "repo1",
      "scan1",
    ]);
    expect(mockExecute).toHaveBeenCalledWith({}, expect.stringContaining("INSERT INTO fix_actions"), expect.any(Array));
    expect(mockExecute).toHaveBeenCalledWith({}, "COMMIT");
  });

  it("rolls back on error", async () => {
    mockExecute
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce(undefined) // DELETE
      .mockRejectedValueOnce(new Error("insert failed")) // INSERT
      .mockResolvedValueOnce(undefined); // ROLLBACK

    const plans = [
      {
        finding: {
          id: "f1",
          repo_id: "repo1",
          scan_id: "scan1",
          category: "ai-files" as const,
          severity: "warning" as const,
          title: "Missing: README",
          details: "",
          evidence: null,
          suggested_actions: [],
          created_at: "",
        },
        action: {
          repo_id: "repo1",
          finding_id: "f1",
          scan_id: "scan1" as string | null,
          title: "Create README.md",
          description: "",
          impact: "docs",
          risk: "low",
          requires_approval: false,
          diff_file: "README.md",
          diff_before: null,
          diff_after: "content",
        },
      },
    ];

    await expect(storePlannedFixes(plans, "repo1", "scan1")).rejects.toThrow("insert failed");
    expect(mockExecute).toHaveBeenCalledWith({}, "ROLLBACK");
  });
});
