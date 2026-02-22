import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
  execute: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/utils", () => ({
  generateId: vi.fn().mockReturnValue("finding-id-1"),
}));

vi.mock("@/lib/actions/custom-rules", () => ({
  getEnabledRulesForPolicy: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/services/concept-scanner", () => ({
  discoverConcepts: vi.fn().mockReturnValue([]),
  storeConcepts: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./ai-files", () => ({
  auditAIFiles: vi.fn().mockReturnValue([]),
}));

vi.mock("./custom-rules", () => ({
  auditCustomRules: vi.fn().mockReturnValue([]),
}));

vi.mock("./dependencies", () => ({
  auditDependencies: vi.fn().mockReturnValue([]),
}));

vi.mock("./structure", () => ({
  auditStructure: vi.fn().mockReturnValue([]),
  resolveWorkspacePackages: vi.fn().mockReturnValue([]),
}));

import { getEnabledRulesForPolicy } from "@/lib/actions/custom-rules";
import { execute, getDb } from "@/lib/db";
import { discoverConcepts, storeConcepts } from "@/lib/services/concept-scanner";
import type { Policy } from "@/lib/types";
import { generateId } from "@/lib/utils";
import { auditAIFiles } from "./ai-files";
import { auditCustomRules } from "./custom-rules";
import { auditDependencies } from "./dependencies";
import { runAudit } from "./index";
import { auditStructure, resolveWorkspacePackages } from "./structure";

const mockAuditDependencies = vi.mocked(auditDependencies);
const mockAuditAIFiles = vi.mocked(auditAIFiles);
const mockAuditStructure = vi.mocked(auditStructure);
const mockAuditCustomRules = vi.mocked(auditCustomRules);
const mockResolveWorkspacePackages = vi.mocked(resolveWorkspacePackages);
const mockGetEnabledRulesForPolicy = vi.mocked(getEnabledRulesForPolicy);
const mockDiscoverConcepts = vi.mocked(discoverConcepts);
const mockStoreConcepts = vi.mocked(storeConcepts);
const mockExecute = vi.mocked(execute);

const mockPolicy: Policy = {
  id: "pol-1",
  name: "Test Policy",
  description: null,
  expected_versions: {},
  banned_dependencies: [],
  allowed_package_managers: [],
  preferred_package_manager: "pnpm",
  ignore_patterns: [],
  generator_defaults: { features: [] },
  repo_types: [],
  is_builtin: false,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const baseOpts = {
  repoId: "repo-1",
  repoPath: "/tmp/test-repo",
  scanId: "scan-1",
  policy: mockPolicy,
};

describe("runAudit", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Re-establish default mock behavior after resetAllMocks
    vi.mocked(getDb).mockResolvedValue({} as never);
    vi.mocked(execute).mockResolvedValue(undefined as never);
    vi.mocked(generateId).mockReturnValue("finding-id-1");
    mockAuditDependencies.mockReturnValue([]);
    mockAuditAIFiles.mockReturnValue([]);
    mockAuditStructure.mockReturnValue([]);
    mockAuditCustomRules.mockReturnValue([]);
    mockResolveWorkspacePackages.mockReturnValue([]);
    mockGetEnabledRulesForPolicy.mockResolvedValue([]);
    mockDiscoverConcepts.mockReturnValue([]);
    mockStoreConcepts.mockResolvedValue(undefined as never);
  });

  it("runs all auditors and returns combined findings", async () => {
    mockAuditDependencies.mockReturnValue([
      {
        category: "dependencies",
        severity: "warning",
        title: "Outdated: react",
        details: "Expected ^19.0.0, found ^18.0.0",
        suggestedActions: ["Update react"],
      },
    ]);
    mockAuditAIFiles.mockReturnValue([
      {
        category: "ai-files",
        severity: "info",
        title: "Missing: CLAUDE.md",
        details: "CLAUDE.md not found",
        suggestedActions: ["Create CLAUDE.md"],
      },
    ]);
    mockAuditStructure.mockReturnValue([]);

    const findings = await runAudit(baseOpts);

    expect(findings).toHaveLength(2);
    expect(findings[0].category).toBe("dependencies");
    expect(findings[1].category).toBe("ai-files");
  });

  it("stores findings in DB inside a transaction", async () => {
    mockAuditDependencies.mockReturnValue([
      {
        category: "dependencies",
        severity: "warning",
        title: "Test finding",
        details: "details",
        suggestedActions: [],
      },
    ]);

    await runAudit(baseOpts);

    const executeCalls = mockExecute.mock.calls.map((c) => String(c[1]));
    expect(executeCalls).toContain("BEGIN TRANSACTION");
    expect(executeCalls.some((sql) => sql.includes("DELETE FROM findings WHERE repo_id"))).toBe(true);
    expect(executeCalls.some((sql) => sql.includes("INSERT INTO findings"))).toBe(true);
    expect(executeCalls).toContain("COMMIT");
  });

  it("rolls back on DB error during finding storage", async () => {
    mockAuditDependencies.mockReturnValue([
      {
        category: "dependencies",
        severity: "warning",
        title: "Test",
        details: "d",
        suggestedActions: [],
      },
    ]);
    // Make the DELETE succeed, but the INSERT fail
    mockExecute.mockImplementation(async (_db, sql) => {
      if (typeof sql === "string" && sql.includes("INSERT INTO findings")) {
        throw new Error("DB insert failure");
      }
    });

    await expect(runAudit(baseOpts)).rejects.toThrow("DB insert failure");

    const executeCalls = mockExecute.mock.calls.map((c) => String(c[1]));
    expect(executeCalls).toContain("ROLLBACK");
  });

  it("catches dependency audit errors as findings", async () => {
    mockAuditDependencies.mockImplementation(() => {
      throw new Error("Cannot read repo");
    });

    const findings = await runAudit(baseOpts);

    expect(findings.some((f) => f.title === "Dependency audit failed")).toBe(true);
    expect(findings.some((f) => f.details === "Cannot read repo")).toBe(true);
  });

  it("catches AI files audit errors as findings", async () => {
    mockAuditAIFiles.mockImplementation(() => {
      throw new Error("AI files read error");
    });

    const findings = await runAudit(baseOpts);

    expect(findings.some((f) => f.title === "AI files audit failed")).toBe(true);
  });

  it("catches structure audit errors as findings", async () => {
    mockAuditStructure.mockImplementation(() => {
      throw new Error("Structure read error");
    });

    const findings = await runAudit(baseOpts);

    expect(findings.some((f) => f.title === "Structure audit failed")).toBe(true);
  });

  it("runs custom rules when enabled rules exist", async () => {
    const mockRules = [
      {
        id: "rule-1",
        name: "Must have LICENSE",
        description: null,
        category: "custom" as const,
        severity: "warning" as const,
        rule_type: "file_exists" as const,
        config: { paths: ["LICENSE"] },
        suggested_actions: ["Add LICENSE file"],
        policy_id: "pol-1",
        is_enabled: true,
        is_builtin: false,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    ];
    mockGetEnabledRulesForPolicy.mockResolvedValue(mockRules);
    mockAuditCustomRules.mockReturnValue([
      {
        category: "custom",
        severity: "warning",
        title: "Must have LICENSE",
        details: "LICENSE file not found",
        suggestedActions: ["Add LICENSE file"],
      },
    ]);

    const findings = await runAudit(baseOpts);

    expect(mockAuditCustomRules).toHaveBeenCalledWith("/tmp/test-repo", mockRules);
    expect(findings.some((f) => f.title === "Must have LICENSE")).toBe(true);
  });

  it("skips custom rules when none are enabled", async () => {
    mockGetEnabledRulesForPolicy.mockResolvedValue([]);

    await runAudit(baseOpts);

    expect(mockAuditCustomRules).not.toHaveBeenCalled();
  });

  it("audits workspace packages for monorepos", async () => {
    mockResolveWorkspacePackages.mockReturnValue([
      { name: "@myorg/web", path: "/tmp/test-repo/apps/web" },
      { name: "@myorg/shared", path: "/tmp/test-repo/packages/shared" },
    ]);
    mockAuditDependencies.mockReturnValue([]);
    mockAuditStructure.mockReturnValue([]);

    await runAudit(baseOpts);

    // auditDependencies called once for root + 2 for workspace packages
    expect(mockAuditDependencies).toHaveBeenCalledTimes(3);
    expect(mockAuditDependencies).toHaveBeenCalledWith("/tmp/test-repo/apps/web", mockPolicy);
    expect(mockAuditDependencies).toHaveBeenCalledWith("/tmp/test-repo/packages/shared", mockPolicy);
  });

  it("prefixes workspace findings with package name", async () => {
    mockResolveWorkspacePackages.mockReturnValue([{ name: "@myorg/web", path: "/tmp/test-repo/apps/web" }]);
    // Root audits return nothing, workspace dep audit returns a finding
    mockAuditDependencies.mockReturnValueOnce([]).mockReturnValueOnce([
      {
        category: "dependencies",
        severity: "warning",
        title: "Outdated: react",
        details: "Expected ^19, found ^18",
        suggestedActions: ["Update"],
      },
    ]);
    mockAuditStructure.mockReturnValue([]);

    const findings = await runAudit(baseOpts);

    expect(findings.some((f) => f.title === "[@myorg/web] Outdated: react")).toBe(true);
  });

  it("discovers and stores concepts", async () => {
    const concepts = [
      {
        concept_type: "skill" as const,
        name: "test-skill",
        description: "A test skill",
        relative_path: ".claude/skills/test/SKILL.md",
        content: "skill content",
        metadata: {},
      },
    ];
    mockDiscoverConcepts.mockReturnValue(concepts);

    await runAudit(baseOpts);

    expect(mockDiscoverConcepts).toHaveBeenCalledWith("/tmp/test-repo");
    expect(mockStoreConcepts).toHaveBeenCalledWith("repo-1", "scan-1", concepts);
  });

  it("skips concept storage when no concepts found", async () => {
    mockDiscoverConcepts.mockReturnValue([]);

    await runAudit(baseOpts);

    expect(mockStoreConcepts).not.toHaveBeenCalled();
  });

  it("calls onProgress throughout the audit", async () => {
    const progressMessages: string[] = [];
    await runAudit({
      ...baseOpts,
      onProgress: (msg) => progressMessages.push(msg),
    });

    expect(progressMessages.some((m) => m.includes("Auditing dependencies"))).toBe(true);
    expect(progressMessages.some((m) => m.includes("Checking AI assistant files"))).toBe(true);
    expect(progressMessages.some((m) => m.includes("Analyzing project structure"))).toBe(true);
    expect(progressMessages.some((m) => m.includes("Evaluating custom rules"))).toBe(true);
    expect(progressMessages.some((m) => m.includes("Discovering Claude Code concepts"))).toBe(true);
  });

  it("reports finding counts in onProgress summary", async () => {
    mockAuditDependencies.mockReturnValue([
      {
        category: "dependencies",
        severity: "critical",
        title: "Critical issue",
        details: "d",
        suggestedActions: [],
      },
      {
        category: "dependencies",
        severity: "warning",
        title: "Warning issue",
        details: "d",
        suggestedActions: [],
      },
      {
        category: "dependencies",
        severity: "info",
        title: "Info issue",
        details: "d",
        suggestedActions: [],
      },
    ]);

    const progressMessages: string[] = [];
    await runAudit({
      ...baseOpts,
      onProgress: (msg) => progressMessages.push(msg),
    });

    const summary = progressMessages.find((m) => m.includes("Found 3 issues"));
    expect(summary).toBeDefined();
    expect(summary).toContain("1 critical");
    expect(summary).toContain("1 warnings");
    expect(summary).toContain("1 info");
  });
});
