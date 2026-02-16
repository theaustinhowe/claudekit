import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(() => ({})),
}));
vi.mock("@/lib/db/helpers", () => ({
  queryAll: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
}));
vi.mock("@/lib/utils", () => ({
  generateId: vi.fn(() => "mock-id"),
}));

import { execute, queryAll } from "@/lib/db/helpers";
import { exportJSON, exportMarkdown, exportPRDescription, saveReport } from "./reporter";

const mockQueryAll = vi.mocked(queryAll);
const mockExecute = vi.mocked(execute);

const repos = [
  {
    id: "repo1",
    name: "my-app",
    local_path: "/home/user/my-app",
    git_remote: null,
    default_branch: "main",
    package_manager: "pnpm",
    repo_type: "nextjs",
    is_monorepo: false,
    last_scanned_at: null,
    created_at: "2024-01-01",
  },
];

const findings = [
  {
    id: "f1",
    repo_id: "repo1",
    scan_id: "scan1",
    category: "dependencies",
    severity: "critical",
    title: "Banned dependency: moment",
    details: "Use date-fns instead",
    evidence: null,
    suggested_actions: '["Remove moment"]',
  },
  {
    id: "f2",
    repo_id: "repo1",
    scan_id: "scan1",
    category: "ai-files",
    severity: "warning",
    title: "Missing: README",
    details: "No README.md found",
    evidence: null,
    suggested_actions: '["Create README.md"]',
  },
  {
    id: "f3",
    repo_id: "repo1",
    scan_id: "scan1",
    category: "structure",
    severity: "info",
    title: "No path aliases",
    details: "Consider adding @/* alias",
    evidence: null,
    suggested_actions: "[]",
  },
];

const fixActions = [
  {
    id: "fix1",
    repo_id: "repo1",
    finding_id: "f1",
    scan_id: "scan1",
    title: "Remove moment",
    description: "Remove moment from package.json",
    impact: "dependencies",
    risk: "medium",
    requires_approval: true,
    diff_file: "package.json",
    diff_before: "{}",
    diff_after: "{}",
    created_at: "2024-01-01",
  },
];

beforeEach(() => {
  vi.resetAllMocks();
});

describe("exportJSON", () => {
  it("generates JSON report with summary", async () => {
    mockQueryAll.mockResolvedValueOnce(repos).mockResolvedValueOnce(findings).mockResolvedValueOnce(fixActions);

    const result = await exportJSON("scan1");
    const report = JSON.parse(result);

    expect(report.scan_id).toBe("scan1");
    expect(report.summary.total_repos).toBe(1);
    expect(report.summary.total_findings).toBe(3);
    expect(report.summary.critical).toBe(1);
    expect(report.summary.warnings).toBe(1);
    expect(report.summary.info).toBe(1);
    expect(report.summary.total_fixes).toBe(1);
    expect(report.repos).toHaveLength(1);
    expect(report.repos[0].findings).toHaveLength(3);
    expect(report.repos[0].fix_actions).toHaveLength(1);
  });

  it("generates report without scanId", async () => {
    mockQueryAll.mockResolvedValueOnce(repos).mockResolvedValueOnce(findings).mockResolvedValueOnce(fixActions);

    const result = await exportJSON();
    const report = JSON.parse(result);

    expect(report.scan_id).toBeNull();
  });
});

describe("exportMarkdown", () => {
  it("generates markdown report with headings and tables", async () => {
    mockQueryAll.mockResolvedValueOnce(repos).mockResolvedValueOnce(findings).mockResolvedValueOnce(fixActions);

    const md = await exportMarkdown("scan1");

    expect(md).toContain("# Repo Auditor Report");
    expect(md).toContain("## Summary");
    expect(md).toContain("| Critical Issues | 1 |");
    expect(md).toContain("| Warnings | 1 |");
    expect(md).toContain("| Info | 1 |");
    expect(md).toContain("## my-app");
    expect(md).toContain("### Findings");
    expect(md).toContain("### Suggested Fixes");
    expect(md).toContain("- [ ] Remove moment (medium risk)");
  });

  it("generates report for repos with no findings", async () => {
    mockQueryAll.mockResolvedValueOnce(repos).mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const md = await exportMarkdown();
    expect(md).toContain("## my-app");
    expect(md).not.toContain("### Findings");
  });
});

describe("exportPRDescription", () => {
  it("generates PR description with fix summary", async () => {
    mockQueryAll.mockResolvedValueOnce(repos).mockResolvedValueOnce(findings).mockResolvedValueOnce(fixActions);

    const pr = await exportPRDescription("scan1");

    expect(pr).toContain("## Repo Auditor Fixes");
    expect(pr).toContain("**1** fixes applied across **1** repositories");
    expect(pr).toContain("**1** critical issues addressed");
    expect(pr).toContain("**1** warnings addressed");
    expect(pr).toContain("- Remove moment (my-app)");
    expect(pr).toContain("### Safety");
  });

  it("handles fix actions without a matching repo", async () => {
    const orphanFix = { ...fixActions[0], repo_id: "unknown" };
    mockQueryAll.mockResolvedValueOnce([]).mockResolvedValueOnce(findings).mockResolvedValueOnce([orphanFix]);

    const pr = await exportPRDescription();
    expect(pr).toContain("- Remove moment");
    expect(pr).not.toContain("(my-app)");
  });
});

describe("saveReport", () => {
  it("inserts a report record into the database", async () => {
    mockExecute.mockResolvedValue(undefined);

    const id = await saveReport("scan1", "json", '{"data": true}');
    expect(id).toBe("mock-id");
    expect(mockExecute).toHaveBeenCalledOnce();
    expect(mockExecute).toHaveBeenCalledWith({}, expect.stringContaining("INSERT INTO reports"), [
      "mock-id",
      "scan1",
      "json",
      '{"data": true}',
    ]);
  });

  it("handles undefined scanId", async () => {
    mockExecute.mockResolvedValue(undefined);

    await saveReport(undefined, "markdown", "# Report");
    expect(mockExecute).toHaveBeenCalledWith({}, expect.stringContaining("INSERT INTO reports"), [
      "mock-id",
      null,
      "markdown",
      "# Report",
    ]);
  });
});
