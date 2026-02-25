import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(() => ({})),
  queryAll: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
  withTransaction: vi.fn((_db, fn) => fn()),
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
  expandTilde: vi.fn((p: string) => p.replace("~", "/home/user")),
}));
vi.mock("@/lib/services/auditors/ai-files", () => ({
  scanAIFiles: vi.fn(),
  auditAIFiles: vi.fn(),
}));
vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
}));

import { execute, queryAll, queryOne, withTransaction } from "@/lib/db";
import { auditAIFiles, scanAIFiles } from "@/lib/services/auditors/ai-files";
import { getAIFilesForRepo, getFindingsForRepo, refreshAIFileFindings } from "./findings";

const mockQueryAll = vi.mocked(queryAll);
const mockQueryOne = vi.mocked(queryOne);
const mockExecute = vi.mocked(execute);
const mockWithTransaction = vi.mocked(withTransaction);
const mockScanAIFiles = vi.mocked(scanAIFiles);
const mockAuditAIFiles = vi.mocked(auditAIFiles);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("getFindingsForRepo", () => {
  it("returns findings with parsed suggested_actions", async () => {
    mockQueryAll.mockResolvedValue([
      {
        id: "1",
        repo_id: "repo-1",
        severity: "critical",
        title: "Missing lockfile",
        suggested_actions: '["Add lockfile"]',
      },
      {
        id: "2",
        repo_id: "repo-1",
        severity: "warning",
        title: "Old dependency",
        suggested_actions: null,
      },
    ]);

    const result = await getFindingsForRepo("repo-1");
    expect(result).toHaveLength(2);
    expect(result[0].suggested_actions).toEqual(["Add lockfile"]);
    expect(result[1].suggested_actions).toEqual([]);
  });
});

describe("getAIFilesForRepo", () => {
  it("returns empty array when repo not found", async () => {
    mockQueryOne.mockResolvedValue(undefined);

    const result = await getAIFilesForRepo("nonexistent");
    expect(result).toEqual([]);
  });

  it("returns fallback files when path does not exist", async () => {
    mockQueryOne.mockResolvedValue({ local_path: "/nonexistent/path" });

    const result = await getAIFilesForRepo("repo-1");
    // When path doesn't exist, returns hardcoded list of common AI files
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty("name");
    expect(result[0]).toHaveProperty("present");
  });

  it("scans AI files when path exists", async () => {
    const fsModule = await import("node:fs");
    vi.mocked(fsModule.existsSync).mockReturnValue(true);
    mockQueryOne.mockResolvedValue({ local_path: process.cwd() });
    const mockFiles = [
      { name: "CLAUDE.md", path: "CLAUDE.md", present: true },
      { name: "README", path: "README.md", present: true },
    ];
    mockScanAIFiles.mockReturnValue(mockFiles);

    const result = await getAIFilesForRepo("repo-1");
    expect(result).toEqual(mockFiles);
    expect(mockScanAIFiles).toHaveBeenCalled();
  });
});

describe("refreshAIFileFindings", () => {
  beforeEach(() => {
    mockWithTransaction.mockImplementation((_db, fn) => fn());
  });

  it("returns early when repo not found", async () => {
    mockQueryOne.mockResolvedValue(undefined);

    await refreshAIFileFindings("nonexistent");

    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("returns early when repo path does not exist on filesystem", async () => {
    mockQueryOne.mockResolvedValue({ local_path: "/nonexistent/path" });
    const fs = await import("node:fs");
    vi.mocked(fs.existsSync).mockReturnValue(false);

    await refreshAIFileFindings("repo-1");

    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("inserts findings with scan ID when existing scan found", async () => {
    const fs = await import("node:fs");
    vi.mocked(fs.existsSync).mockReturnValue(true);

    mockQueryOne
      .mockResolvedValueOnce({ local_path: "/repos/my-repo" }) // repo lookup
      .mockResolvedValueOnce({ id: "scan-1" }); // latest scan lookup

    mockAuditAIFiles.mockReturnValue([
      {
        category: "ai-files",
        severity: "warning",
        title: "Missing CLAUDE.md",
        details: "No CLAUDE.md found",
        evidence: null,
        suggestedActions: ["Create CLAUDE.md"],
      },
    ] as ReturnType<typeof auditAIFiles>);

    await refreshAIFileFindings("repo-1");

    expect(mockExecute).toHaveBeenCalledWith({}, "DELETE FROM findings WHERE repo_id = ? AND category = 'ai-files'", [
      "repo-1",
    ]);
    expect(mockExecute).toHaveBeenCalledWith(
      {},
      expect.stringContaining("INSERT INTO findings"),
      expect.arrayContaining(["test-id", "repo-1", "scan-1"]),
    );
  });

  it("inserts findings with null scan ID when no existing scan", async () => {
    const fs = await import("node:fs");
    vi.mocked(fs.existsSync).mockReturnValue(true);

    mockQueryOne
      .mockResolvedValueOnce({ local_path: "/repos/my-repo" }) // repo lookup
      .mockResolvedValueOnce(undefined); // no latest scan

    mockAuditAIFiles.mockReturnValue([
      {
        category: "ai-files",
        severity: "info",
        title: "Good setup",
        details: "All files present",
        evidence: "evidence-text",
        suggestedActions: [],
      },
    ] as ReturnType<typeof auditAIFiles>);

    await refreshAIFileFindings("repo-1");

    expect(mockExecute).toHaveBeenCalledWith(
      {},
      expect.stringContaining("INSERT INTO findings"),
      expect.arrayContaining(["test-id", "repo-1", null]),
    );
  });
});
