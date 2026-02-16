import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(() => ({})),
  queryAll: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
}));
vi.mock("@/lib/utils", () => ({
  generateId: vi.fn(() => "mock-id"),
  nowTimestamp: vi.fn(() => "2024-01-01T00:00:00.000Z"),
}));
vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    copyFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    renameSync: vi.fn(),
    unlinkSync: vi.fn(),
  },
}));
vi.mock("node:os", () => ({
  default: {
    homedir: vi.fn(() => "/home/user"),
  },
}));
vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

import fs from "node:fs";
import { execute, queryAll, queryOne } from "@/lib/db";
import { applyFixes, restoreSnapshot } from "./apply-engine";

const mockExistsSync = vi.mocked(fs.existsSync);
const mockMkdirSync = vi.mocked(fs.mkdirSync);
const mockCopyFileSync = vi.mocked(fs.copyFileSync);
const mockWriteFileSync = vi.mocked(fs.writeFileSync);
const mockRenameSync = vi.mocked(fs.renameSync);
const mockUnlinkSync = vi.mocked(fs.unlinkSync);
const mockQueryAll = vi.mocked(queryAll);
const mockQueryOne = vi.mocked(queryOne);
const mockExecute = vi.mocked(execute);

beforeEach(() => {
  vi.resetAllMocks();
  mockExistsSync.mockReturnValue(false);
  mockMkdirSync.mockReturnValue(undefined);
});

describe("applyFixes", () => {
  it("returns error when no fix actions found", async () => {
    mockQueryAll.mockResolvedValue([]);
    mockExecute.mockResolvedValue(undefined);

    const result = await applyFixes({
      repoId: "repo1",
      repoPath: "/repo",
      fixActionIds: ["fix1"],
    });

    expect(result).toEqual({ success: false, error: "No fix actions found" });
  });

  it("applies a fix action by writing files atomically", async () => {
    const fixAction = {
      id: "fix1",
      repo_id: "repo1",
      finding_id: "f1",
      scan_id: "scan1",
      title: "Create README.md",
      description: "Generate README",
      impact: "docs",
      risk: "low",
      requires_approval: false,
      diff_file: "README.md",
      diff_before: null,
      diff_after: "# My App",
      created_at: "2024-01-01",
    };

    mockQueryAll.mockResolvedValue([fixAction]);
    mockExecute.mockResolvedValue(undefined);

    const { spawn } = await import("node:child_process");
    const mockSpawn = vi.mocked(spawn);
    const mockChild = {
      on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
        if (event === "close") setTimeout(() => cb(0), 0);
        return mockChild;
      }),
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
    };
    mockSpawn.mockReturnValue(mockChild as never);

    const result = await applyFixes({
      repoId: "repo1",
      repoPath: "/repo",
      scanId: "scan1",
      fixActionIds: ["fix1"],
    });

    expect(result).toHaveProperty("success", true);
    expect(result).toHaveProperty("appliedCount", 1);
    expect(mockWriteFileSync).toHaveBeenCalledWith("/repo/README.md.tmp", "# My App", "utf-8");
    expect(mockRenameSync).toHaveBeenCalledWith("/repo/README.md.tmp", "/repo/README.md");
  });

  it("skips actions without diff content", async () => {
    const fixAction = {
      id: "fix1",
      repo_id: "repo1",
      finding_id: "f1",
      scan_id: null,
      title: "No-op fix",
      description: "Nothing to do",
      impact: "docs",
      risk: "low",
      requires_approval: false,
      diff_file: null,
      diff_before: null,
      diff_after: null,
      created_at: "2024-01-01",
    };

    mockQueryAll.mockResolvedValue([fixAction]);
    mockExecute.mockResolvedValue(undefined);

    const result = await applyFixes({
      repoId: "repo1",
      repoPath: "/repo",
      fixActionIds: ["fix1"],
    });

    expect(result).toHaveProperty("success", true);
    expect(result).toHaveProperty("appliedCount", 0);
  });

  it("creates snapshot before applying fixes", async () => {
    const fixAction = {
      id: "fix1",
      repo_id: "repo1",
      finding_id: "f1",
      scan_id: "scan1",
      title: "Create README.md",
      description: "",
      impact: "docs",
      risk: "low",
      requires_approval: false,
      diff_file: "README.md",
      diff_before: null,
      diff_after: "# content",
      created_at: "2024-01-01",
    };

    mockQueryAll.mockResolvedValue([fixAction]);
    mockExecute.mockResolvedValue(undefined);

    const { spawn } = await import("node:child_process");
    const mockSpawn = vi.mocked(spawn);
    mockSpawn.mockReturnValue({
      on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
        if (event === "close") setTimeout(() => cb(0), 0);
      }),
    } as never);

    await applyFixes({
      repoId: "repo1",
      repoPath: "/repo",
      scanId: "scan1",
      fixActionIds: ["fix1"],
    });

    expect(mockExecute).toHaveBeenCalledWith({}, expect.stringContaining("INSERT INTO snapshots"), expect.any(Array));
  });
});

describe("restoreSnapshot", () => {
  it("returns false when snapshot not found", async () => {
    mockQueryOne.mockResolvedValue(undefined);
    const result = await restoreSnapshot("snap1", "/repo");
    expect(result).toBe(false);
  });

  it("restores files from snapshot", async () => {
    mockQueryOne.mockResolvedValue({
      id: "snap1",
      repo_id: "repo1",
      scan_id: "scan1",
      files: JSON.stringify([{ path: "README.md", exists: true }]),
      snapshot_path: "/snapshots/snap1",
      created_at: "2024-01-01",
    });
    mockExistsSync.mockReturnValue(true);
    mockMkdirSync.mockReturnValue(undefined);

    const result = await restoreSnapshot("snap1", "/repo");
    expect(result).toBe(true);
    expect(mockCopyFileSync).toHaveBeenCalledWith("/snapshots/snap1/README.md", "/repo/README.md");
  });

  it("removes files that did not exist before snapshot", async () => {
    mockQueryOne.mockResolvedValue({
      id: "snap1",
      repo_id: "repo1",
      scan_id: null,
      files: JSON.stringify([{ path: "NEW.md", exists: false }]),
      snapshot_path: "/snapshots/snap1",
      created_at: "2024-01-01",
    });
    mockExistsSync.mockImplementation((p: unknown) => {
      const path = p as string;
      return path === "/repo/NEW.md";
    });

    const result = await restoreSnapshot("snap1", "/repo");
    expect(result).toBe(true);
    expect(mockUnlinkSync).toHaveBeenCalledWith("/repo/NEW.md");
  });
});
