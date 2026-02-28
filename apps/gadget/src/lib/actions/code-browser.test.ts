import { cast } from "@claudekit/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(() => ({})),
  queryOne: vi.fn(),
}));

vi.mock("@/lib/utils", () => ({
  expandTilde: vi.fn((p: string) => p),
  parseGitHubUrl: vi.fn(),
}));

vi.mock("@/lib/actions/settings", () => ({
  getEncryptionKey: vi.fn(),
}));

vi.mock("@/lib/services/language-detector", () => ({
  detectLanguage: vi.fn().mockReturnValue("typescript"),
  isBinaryFile: vi.fn().mockReturnValue(false),
}));

vi.mock("@/lib/services/github-client", () => ({
  getRepoTree: vi.fn(),
  getFileContent: vi.fn(),
  getRepoBranches: vi.fn(),
  getRepoCommits: vi.fn(),
  getFileLastCommit: vi.fn(),
  getCommitDetail: vi.fn(),
}));

vi.mock("@/lib/services/encryption", () => ({
  decrypt: vi.fn(),
}));

vi.mock("@/lib/actions/env-keys", () => ({
  readEnvLocal: vi.fn().mockResolvedValue({}),
}));

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  default: {
    access: vi.fn(),
    readdir: vi.fn(),
    stat: vi.fn(),
    readFile: vi.fn(),
    open: vi.fn(),
  },
  access: vi.fn(),
  readdir: vi.fn(),
  stat: vi.fn(),
  readFile: vi.fn(),
  open: vi.fn(),
}));

import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { queryOne } from "@/lib/db";
import { expandTilde } from "@/lib/utils";
import {
  commitChanges,
  getBranches,
  getCodeFileContent,
  getCommitDetailAction,
  getCommitFilePatch,
  getCommitLog,
  getDirectoryContents,
  getFileTree,
  getGitStatus,
  getLastCommitForPath,
  getReadmeContent,
  getWorkingDiff,
  stageFiles,
  unstageFiles,
} from "./code-browser";

// Helper to set up resolveCodeSource to return local source
function mockLocalRepo(repoPath = "/projects/my-app") {
  vi.mocked(queryOne).mockResolvedValue({
    local_path: repoPath,
    source: null,
    github_url: null,
    github_account_id: null,
    default_branch: "main",
  });
  vi.mocked(expandTilde).mockReturnValue(repoPath);
  vi.mocked(fs.access).mockResolvedValue(undefined);
}

// Helper to mock git command execution
function mockGitExec(output: string) {
  vi.mocked(execFile).mockImplementation((_cmd, _args, _opts, callback) => {
    if (typeof callback === "function") {
      cast<(err: Error | null, result: { stdout: string }) => void>(callback)(null, { stdout: output });
    }
    return {} as ReturnType<typeof execFile>;
  });
}

// Helper for sequential git exec calls
function mockGitExecSequence(...outputs: string[]) {
  const mock = vi.mocked(execFile);
  for (const output of outputs) {
    mock.mockImplementationOnce((_cmd, _args, _opts, callback) => {
      if (typeof callback === "function") {
        cast<(err: Error | null, result: { stdout: string }) => void>(callback)(null, { stdout: output });
      }
      return {} as ReturnType<typeof execFile>;
    });
  }
}

beforeEach(async () => {
  vi.resetAllMocks();
  // Restore mocks cleared by resetAllMocks
  const { detectLanguage, isBinaryFile } = await import("@/lib/services/language-detector");
  vi.mocked(detectLanguage).mockReturnValue("typescript");
  vi.mocked(isBinaryFile).mockReturnValue(false);
});

describe("getDirectoryContents", () => {
  it("returns empty array when repo not found", async () => {
    vi.mocked(queryOne).mockResolvedValue(undefined);
    const result = await getDirectoryContents("nonexistent", "");
    expect(result).toEqual([]);
  });

  it("returns sorted directory entries for local repo", async () => {
    mockLocalRepo();
    vi.mocked(fs.readdir).mockResolvedValue(
      cast([
        { name: "package.json", isFile: () => true, isDirectory: () => false },
        { name: "src", isFile: () => false, isDirectory: () => true },
        { name: "README.md", isFile: () => true, isDirectory: () => false },
      ]),
    );
    vi.mocked(fs.stat).mockResolvedValue(cast({ size: 1234 }));

    const result = await getDirectoryContents("repo-1", "");

    // Directories should come first, then files sorted alphabetically
    expect(result[0]).toEqual(expect.objectContaining({ name: "src", type: "directory" }));
    expect(result[1]).toEqual(expect.objectContaining({ name: "package.json", type: "file" }));
    expect(result[2]).toEqual(expect.objectContaining({ name: "README.md", type: "file" }));
  });

  it("skips node_modules and .git", async () => {
    mockLocalRepo();
    vi.mocked(fs.readdir).mockResolvedValue(
      cast([
        { name: "node_modules", isFile: () => false, isDirectory: () => true },
        { name: ".git", isFile: () => false, isDirectory: () => true },
        { name: "src", isFile: () => false, isDirectory: () => true },
      ]),
    );

    const result = await getDirectoryContents("repo-1", "");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("src");
  });

  it("includes important dotfiles like .gitignore", async () => {
    mockLocalRepo();
    vi.mocked(fs.readdir).mockResolvedValue(
      cast([
        { name: ".gitignore", isFile: () => true, isDirectory: () => false },
        { name: ".random", isFile: () => true, isDirectory: () => false },
        { name: ".env.example", isFile: () => true, isDirectory: () => false },
      ]),
    );
    vi.mocked(fs.stat).mockResolvedValue(cast({ size: 100 }));

    const result = await getDirectoryContents("repo-1", "");
    const names = result.map((e) => e.name);
    expect(names).toContain(".gitignore");
    expect(names).toContain(".env.example");
    expect(names).not.toContain(".random");
  });

  it("builds subdirectory paths correctly", async () => {
    mockLocalRepo();
    vi.mocked(fs.readdir).mockResolvedValue(cast([{ name: "index.ts", isFile: () => true, isDirectory: () => false }]));
    vi.mocked(fs.stat).mockResolvedValue(cast({ size: 500 }));

    const result = await getDirectoryContents("repo-1", "src/lib");
    expect(result[0].path).toBe("src/lib/index.ts");
  });

  it("returns empty on readdir error", async () => {
    mockLocalRepo();
    vi.mocked(fs.readdir).mockRejectedValue(new Error("ENOENT"));

    const result = await getDirectoryContents("repo-1", "nonexistent");
    expect(result).toEqual([]);
  });
});

describe("getCodeFileContent", () => {
  it("returns null when repo not found", async () => {
    vi.mocked(queryOne).mockResolvedValue(undefined);
    const result = await getCodeFileContent("nonexistent", "file.ts");
    expect(result).toBeNull();
  });

  it("returns file content for local file", async () => {
    mockLocalRepo();
    vi.mocked(fs.stat).mockResolvedValue(cast({ size: 256 }));
    vi.mocked(fs.readFile).mockResolvedValue("const x = 1;\n");

    const result = await getCodeFileContent("repo-1", "src/index.ts");

    expect(result).toEqual(
      expect.objectContaining({
        path: "src/index.ts",
        content: "const x = 1;\n",
        language: "typescript",
        isBinary: false,
      }),
    );
  });

  it("returns binary marker for binary files", async () => {
    mockLocalRepo();
    const { isBinaryFile } = await import("@/lib/services/language-detector");
    vi.mocked(isBinaryFile).mockReturnValue(true);
    vi.mocked(fs.stat).mockResolvedValue(cast({ size: 4096 }));

    const result = await getCodeFileContent("repo-1", "image.png");

    expect(result).toEqual(
      expect.objectContaining({
        content: "",
        isBinary: true,
      }),
    );
  });

  it("returns null on read error", async () => {
    mockLocalRepo();
    vi.mocked(fs.stat).mockRejectedValue(new Error("ENOENT"));

    const result = await getCodeFileContent("repo-1", "missing.ts");
    expect(result).toBeNull();
  });
});

describe("getBranches", () => {
  it("returns empty array when repo not found", async () => {
    vi.mocked(queryOne).mockResolvedValue(undefined);
    const result = await getBranches("nonexistent");
    expect(result).toEqual([]);
  });

  it("parses local git branches", async () => {
    mockLocalRepo();
    mockGitExecSequence(
      // git branch -a output
      "main\tabc1234\t*\nfeature/login\tdef5678\t \n",
      // git symbolic-ref output (current branch)
      "main\n",
    );

    const result = await getBranches("repo-1");

    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result[0]).toEqual(
      expect.objectContaining({
        name: "main",
        isCurrent: true,
        isDefault: true,
      }),
    );
  });

  it("deduplicates remote branches", async () => {
    mockLocalRepo();
    mockGitExecSequence("main\tabc1234\t*\norigin/main\tabc1234\t \n", "main\n");

    const result = await getBranches("repo-1");
    const mainBranches = result.filter((b) => b.name === "main");
    expect(mainBranches).toHaveLength(1);
  });

  it("skips HEAD references", async () => {
    mockLocalRepo();
    mockGitExecSequence("main\tabc1234\t*\norigin/HEAD\tabc1234\t \n", "main\n");

    const result = await getBranches("repo-1");
    const headBranches = result.filter((b) => b.name.includes("HEAD"));
    expect(headBranches).toHaveLength(0);
  });

  it("returns empty array on git error", async () => {
    mockLocalRepo();
    vi.mocked(execFile).mockImplementation((_cmd, _args, _opts, callback) => {
      if (typeof callback === "function") {
        (callback as (err: Error | null) => void)(new Error("git error"));
      }
      return {} as ReturnType<typeof execFile>;
    });

    const result = await getBranches("repo-1");
    expect(result).toEqual([]);
  });
});

describe("getCommitLog", () => {
  it("returns empty array when repo not found", async () => {
    vi.mocked(queryOne).mockResolvedValue(undefined);
    const result = await getCommitLog("nonexistent");
    expect(result).toEqual([]);
  });

  it("parses local git log output", async () => {
    mockLocalRepo();
    mockGitExec("abc123\tInitial commit\tJohn Doe\tjohn@example.com\t2024-01-01T00:00:00+00:00\n");

    const result = await getCommitLog("repo-1");

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      sha: "abc123",
      message: "Initial commit",
      author: "John Doe",
      authorEmail: "john@example.com",
      date: "2024-01-01T00:00:00+00:00",
    });
  });

  it("returns empty array on git error", async () => {
    mockLocalRepo();
    vi.mocked(execFile).mockImplementation((_cmd, _args, _opts, callback) => {
      if (typeof callback === "function") {
        (callback as (err: Error | null) => void)(new Error("git error"));
      }
      return {} as ReturnType<typeof execFile>;
    });

    const result = await getCommitLog("repo-1");
    expect(result).toEqual([]);
  });
});

describe("getReadmeContent", () => {
  it("returns null when repo not found", async () => {
    vi.mocked(queryOne).mockResolvedValue(undefined);
    const result = await getReadmeContent("nonexistent");
    expect(result).toBeNull();
  });

  it("finds README.md in local repo", async () => {
    mockLocalRepo();
    vi.mocked(fs.readFile).mockResolvedValueOnce("# My Project\n");

    const result = await getReadmeContent("repo-1");
    expect(result).toBe("# My Project\n");
  });

  it("tries multiple README candidates", async () => {
    mockLocalRepo();
    // First candidate fails, second succeeds
    vi.mocked(fs.readFile).mockRejectedValueOnce(new Error("ENOENT")).mockResolvedValueOnce("# readme\n");

    const result = await getReadmeContent("repo-1");
    expect(result).toBe("# readme\n");
    expect(fs.readFile).toHaveBeenCalledTimes(2);
  });

  it("returns null when no README found", async () => {
    mockLocalRepo();
    vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"));

    const result = await getReadmeContent("repo-1");
    expect(result).toBeNull();
  });
});

describe("getFileTree", () => {
  it("returns empty array when repo not found", async () => {
    vi.mocked(queryOne).mockResolvedValue(undefined);
    const result = await getFileTree("nonexistent");
    expect(result).toEqual([]);
  });

  it("parses git ls-files output", async () => {
    mockLocalRepo();
    mockGitExec("src/index.ts\nsrc/utils.ts\npackage.json\n");

    const result = await getFileTree("repo-1");

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ name: "index.ts", path: "src/index.ts", type: "file" });
    expect(result[2]).toEqual({ name: "package.json", path: "package.json", type: "file" });
  });
});

describe("getLastCommitForPath", () => {
  it("returns null when repo not found", async () => {
    vi.mocked(queryOne).mockResolvedValue(undefined);
    const result = await getLastCommitForPath("nonexistent", "file.ts");
    expect(result).toBeNull();
  });

  it("returns commit info for a file", async () => {
    mockLocalRepo();
    mockGitExec("abc123\tFix bug\tJane Doe\tjane@example.com\t2024-06-01T10:00:00+00:00");

    const result = await getLastCommitForPath("repo-1", "src/index.ts");

    expect(result).toEqual({
      sha: "abc123",
      message: "Fix bug",
      author: "Jane Doe",
      authorEmail: "jane@example.com",
      date: "2024-06-01T10:00:00+00:00",
    });
  });

  it("returns null when file has no commits", async () => {
    mockLocalRepo();
    mockGitExec("");

    const result = await getLastCommitForPath("repo-1", "new-file.ts");
    expect(result).toBeNull();
  });
});

describe("getCommitDetailAction", () => {
  it("returns null when repo not found", async () => {
    vi.mocked(queryOne).mockResolvedValue(undefined);
    const result = await getCommitDetailAction("nonexistent", "abc123");
    expect(result).toBeNull();
  });

  it("parses commit detail with file stats", async () => {
    mockLocalRepo();
    mockGitExecSequence(
      // git log -1 output
      "abc123\tAdd feature\tJohn\tjohn@example.com\t2024-01-01T00:00:00Z",
      // git diff-tree --numstat output
      "10\t2\tsrc/index.ts\n5\t0\tsrc/utils.ts\n",
      // git diff-tree --name-status output
      "M\tsrc/index.ts\nA\tsrc/utils.ts\n",
      // git diff-tree -p output (patches)
      "",
    );

    const result = await getCommitDetailAction("repo-1", "abc123");

    expect(result).toBeTruthy();
    expect(result?.sha).toBe("abc123");
    expect(result?.message).toBe("Add feature");
    expect(result?.files).toHaveLength(2);
    expect(result?.files[0]).toEqual(
      expect.objectContaining({
        path: "src/index.ts",
        status: "modified",
        additions: 10,
        deletions: 2,
      }),
    );
    expect(result?.files[1]).toEqual(
      expect.objectContaining({
        path: "src/utils.ts",
        status: "added",
        additions: 5,
        deletions: 0,
      }),
    );
    expect(result?.stats).toEqual({ additions: 15, deletions: 2, total: 17 });
  });

  it("handles renamed files in status output", async () => {
    mockLocalRepo();
    mockGitExecSequence(
      "abc123\tRename\tJohn\tjohn@example.com\t2024-01-01T00:00:00Z",
      "10\t2\tsrc/new-name.ts\n",
      "R100\tsrc/old-name.ts\tsrc/new-name.ts\n",
      "",
    );

    const result = await getCommitDetailAction("repo-1", "abc123");

    expect(result?.files[0]).toEqual(
      expect.objectContaining({
        path: "src/new-name.ts",
        status: "renamed",
        previousPath: "src/old-name.ts",
      }),
    );
  });

  it("returns null on git error", async () => {
    mockLocalRepo();
    vi.mocked(execFile).mockImplementation((_cmd, _args, _opts, callback) => {
      if (typeof callback === "function") {
        (callback as (err: Error | null) => void)(new Error("git error"));
      }
      return {} as ReturnType<typeof execFile>;
    });

    const result = await getCommitDetailAction("repo-1", "abc123");
    expect(result).toBeNull();
  });
});

describe("getGitStatus", () => {
  it("returns null when repo not found", async () => {
    vi.mocked(queryOne).mockResolvedValue(undefined);
    const result = await getGitStatus("nonexistent");
    expect(result).toBeNull();
  });

  it("parses porcelain v2 status output", async () => {
    mockLocalRepo();
    mockGitExec(
      [
        "# branch.head main",
        "# branch.ab +2 -1",
        "1 M. N... 100644 100644 100644 abc123 def456 src/index.ts",
        "? new-file.ts",
      ].join("\n"),
    );

    const result = await getGitStatus("repo-1");

    expect(result).toBeTruthy();
    expect(result?.branch).toBe("main");
    expect(result?.ahead).toBe(2);
    expect(result?.behind).toBe(1);
    expect(result?.files).toHaveLength(2);
    // Modified staged file
    expect(result?.files[0]).toEqual(
      expect.objectContaining({ path: "src/index.ts", status: "modified", staged: true }),
    );
    // Untracked file
    expect(result?.files[1]).toEqual(
      expect.objectContaining({ path: "new-file.ts", status: "untracked", staged: false }),
    );
  });

  it("parses renamed entries (line starting with 2)", async () => {
    mockLocalRepo();
    mockGitExec(
      ["# branch.head main", "2 R. N... 100644 100644 100644 abc123 def456 R100\tnew-name.ts\told-name.ts"].join("\n"),
    );

    const result = await getGitStatus("repo-1");

    expect(result?.files[0]).toEqual(expect.objectContaining({ path: "new-name.ts", status: "renamed", staged: true }));
  });

  it("returns null on git error", async () => {
    mockLocalRepo();
    vi.mocked(execFile).mockImplementation((_cmd, _args, _opts, callback) => {
      if (typeof callback === "function") {
        (callback as (err: Error | null) => void)(new Error("git error"));
      }
      return {} as ReturnType<typeof execFile>;
    });

    const result = await getGitStatus("repo-1");
    expect(result).toBeNull();
  });
});

describe("getWorkingDiff", () => {
  it("returns null when repo not found", async () => {
    vi.mocked(queryOne).mockResolvedValue(undefined);
    const result = await getWorkingDiff("nonexistent", "file.ts", false);
    expect(result).toBeNull();
  });

  it("returns synthetic diff for untracked files", async () => {
    mockLocalRepo();
    mockGitExecSequence(
      // git status --porcelain output (untracked)
      "?? new-file.ts",
    );
    vi.mocked(fs.readFile).mockResolvedValue("line1\nline2\n");

    const result = await getWorkingDiff("repo-1", "new-file.ts", false);

    expect(result).toContain("--- /dev/null");
    expect(result).toContain("+++ b/new-file.ts");
    expect(result).toContain("+line1");
  });

  it("returns git diff output for tracked files", async () => {
    mockLocalRepo();
    mockGitExecSequence(
      // git status --porcelain output (modified)
      " M tracked-file.ts",
      // git diff output
      "diff --git a/tracked-file.ts b/tracked-file.ts\n@@ -1,3 +1,4 @@\n line1\n+new line\n line2\n",
    );

    const result = await getWorkingDiff("repo-1", "tracked-file.ts", false);
    expect(result).toContain("@@ -1,3 +1,4 @@");
  });

  it("passes --cached flag for staged diffs", async () => {
    mockLocalRepo();
    mockGitExecSequence(
      // git status --porcelain output (staged)
      "M  staged-file.ts",
      // git diff --cached output
      "diff --git a/staged-file.ts b/staged-file.ts\n@@ -1 +1 @@\n-old\n+new\n",
    );

    const result = await getWorkingDiff("repo-1", "staged-file.ts", true);
    expect(result).toBeTruthy();
  });
});

describe("stageFiles", () => {
  it("returns false when repo not found", async () => {
    vi.mocked(queryOne).mockResolvedValue(undefined);
    const result = await stageFiles("nonexistent", ["file.ts"]);
    expect(result).toBe(false);
  });

  it("stages files via git add", async () => {
    mockLocalRepo();
    mockGitExec("");

    const result = await stageFiles("repo-1", ["src/index.ts", "src/utils.ts"]);
    expect(result).toBe(true);
  });

  it("returns false on git error", async () => {
    mockLocalRepo();
    vi.mocked(execFile).mockImplementation((_cmd, _args, _opts, callback) => {
      if (typeof callback === "function") {
        (callback as (err: Error | null) => void)(new Error("git error"));
      }
      return {} as ReturnType<typeof execFile>;
    });

    const result = await stageFiles("repo-1", ["file.ts"]);
    expect(result).toBe(false);
  });
});

describe("unstageFiles", () => {
  it("returns false when repo not found", async () => {
    vi.mocked(queryOne).mockResolvedValue(undefined);
    const result = await unstageFiles("nonexistent", ["file.ts"]);
    expect(result).toBe(false);
  });

  it("unstages files via git reset HEAD", async () => {
    mockLocalRepo();
    mockGitExec("");

    const result = await unstageFiles("repo-1", ["src/index.ts"]);
    expect(result).toBe(true);
  });
});

describe("commitChanges", () => {
  it("returns error when repo not found", async () => {
    vi.mocked(queryOne).mockResolvedValue(undefined);
    const result = await commitChanges("nonexistent", "commit msg");
    expect(result.success).toBe(false);
  });

  it("commits and extracts SHA from output", async () => {
    mockLocalRepo();
    mockGitExec("[main abc1234] Add feature\n 1 file changed\n");

    const result = await commitChanges("repo-1", "Add feature");
    expect(result.success).toBe(true);
    expect(result.sha).toBe("abc1234");
  });

  it("returns error on commit failure", async () => {
    mockLocalRepo();
    vi.mocked(execFile).mockImplementation((_cmd, _args, _opts, callback) => {
      if (typeof callback === "function") {
        (callback as (err: Error | null) => void)(new Error("nothing to commit"));
      }
      return {} as ReturnType<typeof execFile>;
    });

    const result = await commitChanges("repo-1", "empty commit");
    expect(result.success).toBe(false);
    expect(result.error).toContain("nothing to commit");
  });
});

describe("getCommitFilePatch", () => {
  it("returns error when repo not found", async () => {
    vi.mocked(queryOne).mockResolvedValue(undefined);
    const result = await getCommitFilePatch("nonexistent", "sha", "file.ts");
    expect(result.patch).toBeNull();
    expect(result.error).toBeTruthy();
  });

  it("returns patch for a specific file in a commit", async () => {
    mockLocalRepo();
    mockGitExec(
      "diff --git a/src/index.ts b/src/index.ts\nindex abc..def 100644\n--- a/src/index.ts\n+++ b/src/index.ts\n@@ -1,3 +1,4 @@\n line1\n+added line\n line2\n",
    );

    const result = await getCommitFilePatch("repo-1", "abc123", "src/index.ts");
    expect(result.patch).toContain("@@ -1,3 +1,4 @@");
    expect(result.error).toBeUndefined();
  });

  it("returns error for empty diff output", async () => {
    mockLocalRepo();
    mockGitExec("");

    const result = await getCommitFilePatch("repo-1", "abc123", "binary-file.png");
    expect(result.patch).toBeNull();
    expect(result.error).toContain("binary");
  });
});

describe("resolveCodeSource (via public API)", () => {
  it("returns null when no local path and no GitHub URL", async () => {
    vi.mocked(queryOne).mockResolvedValue({
      local_path: "/nonexistent/path",
      source: null,
      github_url: null,
      github_account_id: null,
      default_branch: "main",
    });
    vi.mocked(expandTilde).mockReturnValue("/nonexistent/path");
    vi.mocked(fs.access).mockRejectedValue(new Error("ENOENT"));

    const result = await getDirectoryContents("repo-1", "");
    expect(result).toEqual([]);
  });

  it("returns null when repo row not found", async () => {
    vi.mocked(queryOne).mockResolvedValue(undefined);
    const result = await getDirectoryContents("nonexistent", "");
    expect(result).toEqual([]);
  });
});
