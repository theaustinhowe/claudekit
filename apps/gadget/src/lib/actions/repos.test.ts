import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(() => ({})),
  queryAll: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
}));
vi.mock("@/lib/utils", () => ({
  expandTilde: vi.fn((p: string) => p),
  parseGitHubUrl: vi.fn(),
}));
vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));
vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  },
}));

import { execute, queryAll, queryOne } from "@/lib/db";
import { deleteRepos, getRepoById, getRepos, getReposNeedingAttention, readRepoFile } from "./repos";

const mockQueryAll = vi.mocked(queryAll);
const mockQueryOne = vi.mocked(queryOne);
const mockExecute = vi.mocked(execute);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("getRepos", () => {
  it("returns repos with severity counts", async () => {
    const repos = [
      {
        id: "repo1",
        name: "my-app",
        local_path: "/path",
        critical_count: 2,
        warning_count: 1,
        info_count: 3,
      },
    ];
    mockQueryAll.mockResolvedValue(repos);

    const result = await getRepos();
    expect(result).toEqual(repos);
    expect(mockQueryAll).toHaveBeenCalledWith({}, expect.stringContaining("SELECT r.*"));
    expect(mockQueryAll).toHaveBeenCalledWith({}, expect.stringContaining("WHERE r.id != '__library__'"));
  });

  it("returns empty array when no repos exist", async () => {
    mockQueryAll.mockResolvedValue([]);
    const result = await getRepos();
    expect(result).toEqual([]);
  });
});

describe("getRepoById", () => {
  it("returns repo when found", async () => {
    const repo = { id: "repo1", name: "my-app", critical_count: 0, warning_count: 0, info_count: 0 };
    mockQueryOne.mockResolvedValue(repo);

    const result = await getRepoById("repo1");
    expect(result).toEqual(repo);
    expect(mockQueryOne).toHaveBeenCalledWith({}, expect.stringContaining("WHERE r.id = ?"), ["repo1"]);
  });

  it("returns null when repo not found", async () => {
    mockQueryOne.mockResolvedValue(undefined);
    const result = await getRepoById("nonexistent");
    expect(result).toBeNull();
  });
});

describe("getReposNeedingAttention", () => {
  it("returns repos with attention metrics", async () => {
    const rows = [
      {
        id: "repo1",
        name: "stale-app",
        local_path: "/path",
        critical_count: 1,
        warning_count: 2,
        last_scanned_at: null,
      },
    ];
    mockQueryAll.mockResolvedValue(rows);

    const result = await getReposNeedingAttention();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("repo1");
    expect(result[0].critical_count).toBe(1);
    expect(result[0].warning_count).toBe(2);
    expect(result[0].is_stale).toBe(true);
  });

  it("marks repos as stale when scan is older than 7 days", async () => {
    const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    mockQueryAll.mockResolvedValue([
      {
        id: "repo1",
        name: "old-scan",
        local_path: "/path",
        critical_count: 0,
        warning_count: 0,
        last_scanned_at: oldDate,
      },
    ]);

    const result = await getReposNeedingAttention();
    expect(result[0].is_stale).toBe(true);
  });

  it("marks repos as not stale when scan is recent", async () => {
    const recentDate = new Date().toISOString();
    mockQueryAll.mockResolvedValue([
      {
        id: "repo1",
        name: "fresh-scan",
        local_path: "/path",
        critical_count: 0,
        warning_count: 0,
        last_scanned_at: recentDate,
      },
    ]);

    const result = await getReposNeedingAttention();
    expect(result[0].is_stale).toBe(false);
  });
});

describe("deleteRepos", () => {
  it("deletes repos and related data", async () => {
    mockExecute.mockResolvedValue(undefined);

    const result = await deleteRepos(["repo1", "repo2"]);
    expect(result).toEqual({ deleted: 2 });

    const deleteCalls = mockExecute.mock.calls.filter((c) => (c[1] as string).includes("DELETE FROM"));
    expect(deleteCalls.length).toBeGreaterThan(1);

    const tableNames = deleteCalls.map((c) => {
      const match = (c[1] as string).match(/DELETE FROM (\w+)/);
      return match ? match[1] : "";
    });
    expect(tableNames).toContain("findings");
    expect(tableNames).toContain("fix_actions");
    expect(tableNames).toContain("repos");
  });

  it("returns 0 when ids array is empty", async () => {
    const result = await deleteRepos([]);
    expect(result).toEqual({ deleted: 0 });
    expect(mockExecute).not.toHaveBeenCalled();
  });
});

describe("readRepoFile", () => {
  it("returns file content", async () => {
    mockQueryOne.mockResolvedValue({ local_path: "/repo" });

    const fs = (await import("node:fs")).default;
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue("file content");

    const result = await readRepoFile("repo1", "README.md");
    expect(result).toEqual({ content: "file content" });
  });

  it("returns error when repo not found", async () => {
    mockQueryOne.mockResolvedValue(undefined);
    const result = await readRepoFile("nonexistent", "README.md");
    expect(result).toEqual({ content: null, error: "Repository not found" });
  });

  it("returns error when file not found", async () => {
    mockQueryOne.mockResolvedValue({ local_path: "/repo" });

    const fs = (await import("node:fs")).default;
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const result = await readRepoFile("repo1", "missing.txt");
    expect(result).toEqual({ content: null, error: "File not found" });
  });

  it("prevents path traversal", async () => {
    mockQueryOne.mockResolvedValue({ local_path: "/repo" });

    const result = await readRepoFile("repo1", "../../etc/passwd");
    expect(result).toEqual({ content: null, error: "Invalid path" });
  });
});
