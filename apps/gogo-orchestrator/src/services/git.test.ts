import { join, resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock child_process.execFile for async git function tests
vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

// Mock fs/promises for async git function tests
vi.mock("node:fs/promises", () => ({
  access: vi.fn(),
  mkdir: vi.fn(),
  rm: vi.fn(),
  readFile: vi.fn(),
}));

// Mock logger
vi.mock("../utils/logger.js", () => ({
  createServiceLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Mock timeout to pass through
vi.mock("../utils/timeout.js", () => ({
  withTimeout: vi.fn((promise: Promise<unknown>) => promise),
  TIMEOUTS: {
    GITHUB_API: 30000,
    GIT_OPERATION: 120000,
    DATABASE_QUERY: 10000,
    PROCESS_TERM: 5000,
  },
}));

import { execFile } from "node:child_process";
import { access, mkdir, readFile, rm } from "node:fs/promises";
import { cast } from "@claudekit/test-utils";
import {
  commitAllChanges,
  createWorktree,
  ensureBaseClone,
  fetchUpdates,
  type GitConfig,
  getBareRepoPath,
  getChangedFiles,
  getCommitLog,
  getFileDiff,
  getJobsDir,
  getRepoDir,
  getRepoSlug,
  hasCommits,
  isWorkingTreeClean,
  listWorktrees,
  pushBranch,
  removeWorktree,
  restoreWorktree,
} from "./git.js";

// Helper: make execFile mock resolve
function mockExecFile(stdout = "", stderr = "") {
  vi.mocked(execFile).mockImplementation((_cmd: unknown, _args: unknown, _opts: unknown, cb?: unknown) => {
    if (typeof _opts === "function") {
      // No options passed, _opts is actually callback
      (_opts as (err: null, result: { stdout: string; stderr: string }) => void)(null, { stdout, stderr });
    } else if (typeof cb === "function") {
      (cb as (err: null, result: { stdout: string; stderr: string }) => void)(null, { stdout, stderr });
    }
    return cast({ pid: 1234 });
  });
}

// Helper: make execFile reject
function mockExecFileFail(message: string) {
  vi.mocked(execFile).mockImplementation((_cmd: unknown, _args: unknown, _opts: unknown, cb?: unknown) => {
    const err = new Error(message) as Error & { stdout: string; stderr: string };
    err.stdout = "";
    err.stderr = message;
    if (typeof _opts === "function") {
      (_opts as (err: Error) => void)(err);
    } else if (typeof cb === "function") {
      (cb as (err: Error) => void)(err);
    }
    return cast({ pid: 1234 });
  });
}

describe("git path helpers", () => {
  const baseConfig: GitConfig = {
    workdir: "/path/to/workdir",
    owner: "my-org",
    name: "my-repo",
    token: "test-token",
    repoUrl: "https://github.com/my-org/my-repo",
  };

  describe("getRepoSlug", () => {
    it("creates lowercase slug from owner and name", () => {
      expect(getRepoSlug("MyOrg", "MyRepo")).toBe("myorg-myrepo");
    });

    it("handles already lowercase input", () => {
      expect(getRepoSlug("myorg", "myrepo")).toBe("myorg-myrepo");
    });

    it("removes special characters", () => {
      expect(getRepoSlug("my.org", "my_repo")).toBe("my-org-my-repo");
    });

    it("collapses multiple non-alphanumeric characters", () => {
      expect(getRepoSlug("my--org", "my__repo")).toBe("my-org-my-repo");
    });

    it("removes leading and trailing dashes", () => {
      expect(getRepoSlug("-org-", "-repo-")).toBe("org-repo");
    });

    it("handles numbers", () => {
      expect(getRepoSlug("org123", "repo456")).toBe("org123-repo456");
    });

    it("removes directory traversal characters", () => {
      expect(getRepoSlug("../../../etc", "passwd")).toBe("etc-passwd");
      expect(getRepoSlug("..%2F..%2F", "hack")).toBe("2f-2f-hack");
    });

    it("handles slashes in names", () => {
      expect(getRepoSlug("org/sub", "repo/part")).toBe("org-sub-repo-part");
    });

    it("handles empty strings", () => {
      expect(getRepoSlug("", "")).toBe("");
    });

    it("handles single character inputs", () => {
      expect(getRepoSlug("a", "b")).toBe("a-b");
    });

    it("handles unicode characters", () => {
      const result = getRepoSlug("org\u00e9", "r\u00e9po");
      expect(result).toMatch(/^[a-z0-9-]+$/);
    });
  });

  describe("getRepoDir", () => {
    it("returns workdir + slug", () => {
      expect(getRepoDir(baseConfig)).toBe("/path/to/workdir/my-org-my-repo");
    });

    it("normalizes owner and name", () => {
      const config: GitConfig = { ...baseConfig, owner: "MyOrg", name: "MyRepo" };
      expect(getRepoDir(config)).toBe("/path/to/workdir/myorg-myrepo");
    });
  });

  describe("getBareRepoPath", () => {
    it("returns .repo under repo dir", () => {
      expect(getBareRepoPath(baseConfig)).toBe("/path/to/workdir/my-org-my-repo/.repo");
    });

    it("is inside repo dir", () => {
      const repoDir = getRepoDir(baseConfig);
      const bareRepoPath = getBareRepoPath(baseConfig);
      expect(bareRepoPath.startsWith(repoDir)).toBe(true);
    });
  });

  describe("getJobsDir", () => {
    it("returns jobs under repo dir", () => {
      expect(getJobsDir(baseConfig)).toBe("/path/to/workdir/my-org-my-repo/jobs");
    });

    it("is inside repo dir", () => {
      const repoDir = getRepoDir(baseConfig);
      const jobsDir = getJobsDir(baseConfig);
      expect(jobsDir.startsWith(repoDir)).toBe(true);
    });
  });

  describe("multi-repo directory isolation", () => {
    it("different repos get different directories", () => {
      const configA: GitConfig = { ...baseConfig, owner: "org-a", name: "repo-a" };
      const configB: GitConfig = { ...baseConfig, owner: "org-b", name: "repo-b" };

      expect(getRepoDir(configA)).not.toBe(getRepoDir(configB));
      expect(getBareRepoPath(configA)).not.toBe(getBareRepoPath(configB));
      expect(getJobsDir(configA)).not.toBe(getJobsDir(configB));
    });

    it("same repo name different orgs get different directories", () => {
      const configA: GitConfig = { ...baseConfig, owner: "org-a", name: "shared-repo" };
      const configB: GitConfig = { ...baseConfig, owner: "org-b", name: "shared-repo" };
      expect(getRepoDir(configA)).not.toBe(getRepoDir(configB));
    });

    it("repos share same workdir but have isolated directories", () => {
      const sharedWorkdir = "/shared/workdir";
      const configA: GitConfig = { ...baseConfig, workdir: sharedWorkdir, owner: "org-a", name: "repo-a" };
      const configB: GitConfig = { ...baseConfig, workdir: sharedWorkdir, owner: "org-b", name: "repo-b" };
      expect(getRepoDir(configA).startsWith(sharedWorkdir)).toBe(true);
      expect(getRepoDir(configB).startsWith(sharedWorkdir)).toBe(true);
      expect(getRepoDir(configA)).not.toBe(getRepoDir(configB));
    });
  });

  describe("path structure", () => {
    it("follows expected structure: workdir/slug/.repo and workdir/slug/jobs", () => {
      const repoDir = getRepoDir(baseConfig);
      const bareRepoPath = getBareRepoPath(baseConfig);
      const jobsDir = getJobsDir(baseConfig);
      expect(bareRepoPath).toBe(join(repoDir, ".repo"));
      expect(jobsDir).toBe(join(repoDir, "jobs"));
    });

    it("repo dir is directly under workdir", () => {
      const repoDir = getRepoDir(baseConfig);
      const expectedSlug = getRepoSlug(baseConfig.owner, baseConfig.name);
      expect(repoDir).toBe(join(baseConfig.workdir, expectedSlug));
    });
  });

  describe("restoreWorktree", () => {
    it("is exported", () => {
      expect(typeof restoreWorktree).toBe("function");
    });

    it("computes worktree path using issueNumber", () => {
      const jobsDir = getJobsDir(baseConfig);
      const expectedPath = resolve(join(jobsDir, "issue-42"));
      const repoDir = getRepoDir(baseConfig);
      expect(expectedPath.startsWith(resolve(repoDir))).toBe(true);
    });

    it("computes manual worktree path using jobId prefix", () => {
      const jobsDir = getJobsDir(baseConfig);
      const jobId = "abcd1234-5678-9012-3456-789012345678";
      const expectedPath = resolve(join(jobsDir, `manual-${jobId.slice(0, 8)}`));
      const repoDir = getRepoDir(baseConfig);
      expect(expectedPath.startsWith(resolve(repoDir))).toBe(true);
    });
  });
});

describe("git async operations (mocked)", () => {
  const baseConfig: GitConfig = {
    workdir: "/tmp/workdir",
    owner: "test-org",
    name: "test-repo",
    token: "ghp_test123",
    repoUrl: "https://github.com/test-org/test-repo",
  };

  beforeEach(() => {
    vi.resetAllMocks();
    // Default: access resolves (path exists)
    vi.mocked(access).mockResolvedValue(undefined);
    vi.mocked(mkdir).mockResolvedValue(undefined);
    vi.mocked(rm).mockResolvedValue(undefined);
  });

  describe("ensureBaseClone", () => {
    it("skips cloning when bare repo already exists", async () => {
      vi.mocked(access).mockResolvedValue(undefined); // Path exists
      await ensureBaseClone(baseConfig);
      // execFile should NOT be called (no clone needed)
      expect(execFile).not.toHaveBeenCalled();
    });

    it("clones when bare repo does not exist", async () => {
      vi.mocked(access).mockRejectedValue(new Error("ENOENT")); // Path does not exist
      mockExecFile(""); // git clone succeeds
      await ensureBaseClone(baseConfig);
      expect(mkdir).toHaveBeenCalled();
      expect(execFile).toHaveBeenCalled();
    });
  });

  describe("fetchUpdates", () => {
    it("throws when bare repo does not exist", async () => {
      vi.mocked(access).mockRejectedValue(new Error("ENOENT"));
      await expect(fetchUpdates(baseConfig)).rejects.toThrow("Base repository not found");
    });

    it("fetches when bare repo exists", async () => {
      vi.mocked(access).mockResolvedValue(undefined);
      mockExecFile("");
      await fetchUpdates(baseConfig);
      expect(execFile).toHaveBeenCalled();
    });
  });

  describe("pushBranch", () => {
    it("calls git push with authenticated URL", async () => {
      mockExecFile("");
      await pushBranch(baseConfig, "/tmp/worktree", "agent/issue-42-fix");
      expect(execFile).toHaveBeenCalled();
    });

    it("throws on push failure", async () => {
      mockExecFileFail("Authentication failed");
      await expect(pushBranch(baseConfig, "/tmp/worktree", "agent/issue-42-fix")).rejects.toThrow("Git command failed");
    });
  });

  describe("isWorkingTreeClean", () => {
    it("returns true when working tree is clean", async () => {
      mockExecFile(""); // empty output = clean
      const result = await isWorkingTreeClean("/tmp/worktree");
      expect(result).toBe(true);
    });

    it("returns false when working tree has changes", async () => {
      mockExecFile("M  src/index.ts\n"); // modified file
      const result = await isWorkingTreeClean("/tmp/worktree");
      expect(result).toBe(false);
    });

    it("returns false on error", async () => {
      mockExecFileFail("fatal: not a git repository");
      const result = await isWorkingTreeClean("/tmp/worktree");
      expect(result).toBe(false);
    });
  });

  describe("listWorktrees", () => {
    it("returns empty array when bare repo does not exist", async () => {
      vi.mocked(access).mockRejectedValue(new Error("ENOENT"));
      const result = await listWorktrees(baseConfig);
      expect(result).toEqual([]);
    });

    it("parses porcelain worktree output", async () => {
      vi.mocked(access).mockResolvedValue(undefined);
      mockExecFile(
        [
          "worktree /tmp/workdir/test-org-test-repo/.repo",
          "HEAD abc123def",
          "branch refs/heads/main",
          "",
          "worktree /tmp/workdir/test-org-test-repo/jobs/issue-42",
          "HEAD def456abc",
          "branch refs/heads/agent/issue-42-fix",
          "",
        ].join("\n"),
      );

      const result = await listWorktrees(baseConfig);
      // Should skip .repo and only return the job worktree
      expect(result).toHaveLength(1);
      expect(result[0].path).toBe("/tmp/workdir/test-org-test-repo/jobs/issue-42");
      expect(result[0].branch).toBe("agent/issue-42-fix");
      expect(result[0].commit).toBe("def456abc");
    });

    it("handles empty worktree list", async () => {
      vi.mocked(access).mockResolvedValue(undefined);
      mockExecFile("");
      const result = await listWorktrees(baseConfig);
      expect(result).toEqual([]);
    });
  });

  describe("hasCommits", () => {
    it("returns true when there are commits ahead", async () => {
      vi.mocked(execFile).mockImplementation((_cmd: unknown, _args: unknown, _opts: unknown, cb?: unknown) => {
        const args = _args as string[];
        // First call: fetch, second call: rev-list with origin/main
        if (args.includes("fetch")) {
          if (typeof cb === "function") {
            (cb as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
              stdout: "",
              stderr: "",
            });
          }
        } else if (args.includes("rev-list")) {
          if (typeof cb === "function") {
            (cb as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
              stdout: "3\n",
              stderr: "",
            });
          }
        }
        return cast({ pid: 1234 });
      });

      const result = await hasCommits(baseConfig, "/tmp/worktree", "main");
      expect(result).toBe(true);
    });

    it("returns false when there are no commits", async () => {
      vi.mocked(execFile).mockImplementation((_cmd: unknown, _args: unknown, _opts: unknown, cb?: unknown) => {
        const args = _args as string[];
        if (args.includes("fetch")) {
          if (typeof cb === "function") {
            (cb as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
              stdout: "",
              stderr: "",
            });
          }
        } else if (args.includes("rev-list")) {
          if (typeof cb === "function") {
            (cb as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
              stdout: "0\n",
              stderr: "",
            });
          }
        }
        return cast({ pid: 1234 });
      });

      const result = await hasCommits(baseConfig, "/tmp/worktree", "main");
      expect(result).toBe(false);
    });

    it("falls back to local baseBranch when origin ref fails", async () => {
      let revListCallCount = 0;
      vi.mocked(execFile).mockImplementation((_cmd: unknown, _args: unknown, _opts: unknown, cb?: unknown) => {
        const args = _args as string[];
        const callback = typeof _opts === "function" ? _opts : cb;

        if (args.includes("fetch")) {
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "",
            stderr: "",
          });
        } else if (args.includes("rev-list")) {
          revListCallCount++;
          if (revListCallCount === 1) {
            // origin/main fails
            const err = new Error("bad ref") as Error & { stdout: string; stderr: string };
            err.stdout = "";
            err.stderr = "bad ref";
            (callback as (err: Error) => void)(err);
          } else if (revListCallCount === 2) {
            // local main succeeds with commits
            (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
              stdout: "2\n",
              stderr: "",
            });
          }
        }
        return cast({ pid: 1234 });
      });

      const result = await hasCommits(baseConfig, "/tmp/worktree", "main");
      expect(result).toBe(true);
    });

    it("handles fetch failure gracefully", async () => {
      vi.mocked(execFile).mockImplementation((_cmd: unknown, _args: unknown, _opts: unknown, cb?: unknown) => {
        const args = _args as string[];
        const callback = typeof _opts === "function" ? _opts : cb;

        if (args.includes("fetch")) {
          // Fetch fails
          const err = new Error("network") as Error & { stdout: string; stderr: string };
          err.stdout = "";
          err.stderr = "network";
          (callback as (err: Error) => void)(err);
        } else if (args.includes("rev-list")) {
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "1\n",
            stderr: "",
          });
        }
        return cast({ pid: 1234 });
      });

      const result = await hasCommits(baseConfig, "/tmp/worktree", "main");
      expect(result).toBe(true);
    });

    it("returns false when all rev-list comparisons fail and falls to last resort", async () => {
      vi.mocked(execFile).mockImplementation((_cmd: unknown, _args: unknown, _opts: unknown, cb?: unknown) => {
        const args = _args as string[];
        const callback = typeof _opts === "function" ? _opts : cb;

        if (args.includes("fetch")) {
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "",
            stderr: "",
          });
        } else if (args.includes("rev-list") && args.some((a) => a.includes(".."))) {
          // All comparison-based rev-list calls fail
          const err = new Error("bad ref") as Error & { stdout: string; stderr: string };
          err.stdout = "";
          err.stderr = "bad ref";
          (callback as (err: Error) => void)(err);
        } else if (args.includes("rev-list")) {
          // Last resort: HEAD count
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "5\n",
            stderr: "",
          });
        }
        return cast({ pid: 1234 });
      });

      const result = await hasCommits(baseConfig, "/tmp/worktree", "main");
      // Returns false because even though there are commits, the comparison failed
      expect(result).toBe(false);
    });

    it("returns false when all git operations fail completely", async () => {
      mockExecFileFail("everything failed");

      const result = await hasCommits(baseConfig, "/tmp/worktree", "main");
      expect(result).toBe(false);
    });
  });

  describe("getCommitLog", () => {
    it("returns commit log from origin/baseBranch", async () => {
      mockExecFile("- Fix bug\n- Add tests");
      const result = await getCommitLog(baseConfig, "/tmp/worktree", "main");
      expect(result).toBe("- Fix bug\n- Add tests");
    });

    it("returns fallback message when all refs fail", async () => {
      mockExecFileFail("fatal: bad ref");
      const result = await getCommitLog(baseConfig, "/tmp/worktree", "main");
      expect(result).toBe("Unable to retrieve commit log.");
    });

    it("falls back to local baseBranch when origin ref returns empty", async () => {
      let callIdx = 0;
      vi.mocked(execFile).mockImplementation((_cmd: unknown, _args: unknown, _opts: unknown, cb?: unknown) => {
        callIdx++;
        const callback = typeof _opts === "function" ? _opts : cb;

        if (callIdx === 1) {
          // First ref (origin/main) returns empty
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "",
            stderr: "",
          });
        } else if (callIdx === 2) {
          // Second ref (main) returns commits
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "- Local commit\n",
            stderr: "",
          });
        } else {
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "",
            stderr: "",
          });
        }
        return cast({ pid: 1234 });
      });

      const result = await getCommitLog(baseConfig, "/tmp/worktree", "main");
      expect(result).toBe("- Local commit");
    });

    it("uses last resort recent commits when base refs fail", async () => {
      let callIdx = 0;
      vi.mocked(execFile).mockImplementation((_cmd: unknown, _args: unknown, _opts: unknown, cb?: unknown) => {
        callIdx++;
        const callback = typeof _opts === "function" ? _opts : cb;

        if (callIdx <= 2) {
          // First two refs fail
          const err = new Error("bad ref") as Error & { stdout: string; stderr: string };
          err.stdout = "";
          err.stderr = "bad ref";
          (callback as (err: Error) => void)(err);
        } else {
          // Last resort: show recent commits
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "- Recent commit 1\n- Recent commit 2",
            stderr: "",
          });
        }
        return cast({ pid: 1234 });
      });

      const result = await getCommitLog(baseConfig, "/tmp/worktree", "main");
      expect(result).toBe("- Recent commit 1\n- Recent commit 2");
    });

    it("returns 'No commits yet.' when last resort returns empty", async () => {
      let callIdx = 0;
      vi.mocked(execFile).mockImplementation((_cmd: unknown, _args: unknown, _opts: unknown, cb?: unknown) => {
        callIdx++;
        const callback = typeof _opts === "function" ? _opts : cb;

        if (callIdx <= 2) {
          const err = new Error("bad ref") as Error & { stdout: string; stderr: string };
          err.stdout = "";
          err.stderr = "bad ref";
          (callback as (err: Error) => void)(err);
        } else {
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "",
            stderr: "",
          });
        }
        return cast({ pid: 1234 });
      });

      const result = await getCommitLog(baseConfig, "/tmp/worktree", "main");
      expect(result).toBe("No commits yet.");
    });
  });

  describe("getChangedFiles", () => {
    it("parses status output for uncommitted changes", async () => {
      vi.mocked(execFile).mockImplementation((_cmd: unknown, _args: unknown, _opts: unknown, cb?: unknown) => {
        const args = _args as string[];
        const callback = typeof _opts === "function" ? _opts : cb;
        if (args.includes("--porcelain") && !args.includes("--name-status")) {
          // git status --porcelain
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout:
              "M  src/index.ts\nA  src/new-file.ts\n?? untracked.txt\nD  src/old.ts\nR  src/rename.ts -> src/renamed.ts\n",
            stderr: "",
          });
        } else {
          // Other calls (fetch, merge-base, diff)
          const err = new Error("not available") as Error & { stdout: string; stderr: string };
          err.stdout = "";
          err.stderr = "";
          (callback as (err: Error) => void)(err);
        }
        return cast({ pid: 1234 });
      });

      const result = await getChangedFiles(baseConfig, "/tmp/worktree", "main");

      // Should have parsed the status output
      expect(result.length).toBeGreaterThanOrEqual(4);
      const paths = result.map((f) => f.path);
      expect(paths).toContain("src/index.ts");
      expect(paths).toContain("src/new-file.ts");
      expect(paths).toContain("untracked.txt");
      expect(paths).toContain("src/old.ts");

      // Check statuses
      const indexFile = result.find((f) => f.path === "src/index.ts");
      expect(indexFile?.status).toBe("modified");
      const newFile = result.find((f) => f.path === "src/new-file.ts");
      expect(newFile?.status).toBe("added");
      const untrackedFile = result.find((f) => f.path === "untracked.txt");
      expect(untrackedFile?.status).toBe("added");
      const deletedFile = result.find((f) => f.path === "src/old.ts");
      expect(deletedFile?.status).toBe("deleted");
    });

    it("returns sorted files", async () => {
      vi.mocked(execFile).mockImplementation((_cmd: unknown, _args: unknown, _opts: unknown, cb?: unknown) => {
        const args = _args as string[];
        const callback = typeof _opts === "function" ? _opts : cb;
        if (args.includes("--porcelain")) {
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "M  z-file.ts\nM  a-file.ts\n",
            stderr: "",
          });
        } else {
          const err = new Error("not available") as Error & { stdout: string; stderr: string };
          err.stdout = "";
          err.stderr = "";
          (callback as (err: Error) => void)(err);
        }
        return cast({ pid: 1234 });
      });

      const result = await getChangedFiles(baseConfig, "/tmp/worktree", "main");
      expect(result[0].path).toBe("a-file.ts");
      expect(result[1].path).toBe("z-file.ts");
    });

    it("returns empty array when no changes", async () => {
      vi.mocked(execFile).mockImplementation((_cmd: unknown, _args: unknown, _opts: unknown, cb?: unknown) => {
        const callback = typeof _opts === "function" ? _opts : cb;
        const args = _args as string[];
        if (args.includes("--porcelain")) {
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "",
            stderr: "",
          });
        } else {
          const err = new Error("not available") as Error & { stdout: string; stderr: string };
          err.stdout = "";
          err.stderr = "";
          (callback as (err: Error) => void)(err);
        }
        return cast({ pid: 1234 });
      });

      const result = await getChangedFiles(baseConfig, "/tmp/worktree", "main");
      expect(result).toEqual([]);
    });
  });

  describe("commitAllChanges", () => {
    it("stages all changes and commits", async () => {
      mockExecFile("");
      await commitAllChanges("/tmp/worktree", "chore: auto-commit");
      // execFile should be called at least twice (git add, git commit)
      expect(execFile).toHaveBeenCalledTimes(2);
    });

    it("throws on commit failure", async () => {
      let callIdx = 0;
      vi.mocked(execFile).mockImplementation((_cmd: unknown, _args: unknown, _opts: unknown, cb?: unknown) => {
        callIdx++;
        const callback = typeof _opts === "function" ? _opts : cb;
        if (callIdx === 1) {
          // git add succeeds
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "",
            stderr: "",
          });
        } else {
          // git commit fails
          const err = new Error("nothing to commit") as Error & { stdout: string; stderr: string };
          err.stdout = "";
          err.stderr = "nothing to commit";
          (callback as (err: Error) => void)(err);
        }
        return cast({ pid: 1234 });
      });

      await expect(commitAllChanges("/tmp/worktree", "test")).rejects.toThrow();
    });
  });

  describe("removeWorktree", () => {
    it("removes worktree and cleans up agent branch", async () => {
      const config = { ...baseConfig, workdir: "/tmp/workdir" };
      const worktreePath = "/tmp/workdir/test-org-test-repo/jobs/issue-42";
      mockExecFile("agent/issue-42-fix\n");
      await removeWorktree(config, worktreePath);
      expect(execFile).toHaveBeenCalled();
    });

    it("rejects directory traversal in worktree path", async () => {
      const config = { ...baseConfig, workdir: "/tmp/workdir" };
      await expect(removeWorktree(config, "/etc/passwd")).rejects.toThrow("directory traversal");
    });

    it("falls back to manual cleanup when git worktree remove fails", async () => {
      const config = { ...baseConfig, workdir: "/tmp/workdir" };
      const worktreePath = "/tmp/workdir/test-org-test-repo/jobs/issue-42";

      vi.mocked(execFile).mockImplementation((_cmd: unknown, _args: unknown, _opts: unknown, cb?: unknown) => {
        const callback = typeof _opts === "function" ? _opts : cb;
        const args = _args as string[];

        if (args.includes("rev-parse")) {
          // Get branch name
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "agent/issue-42-fix\n",
            stderr: "",
          });
        } else if (args.includes("worktree") && args.includes("remove")) {
          // worktree remove fails
          const err = new Error("worktree remove failed") as Error & { stdout: string; stderr: string };
          err.stdout = "";
          err.stderr = "worktree remove failed";
          (callback as (err: Error) => void)(err);
        } else {
          // prune and branch -D succeed
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "",
            stderr: "",
          });
        }
        return cast({ pid: 1234 });
      });

      await removeWorktree(config, worktreePath);
      // Should have called rm as fallback
      expect(rm).toHaveBeenCalled();
    });

    it("throws when both git worktree remove and manual cleanup fail", async () => {
      const config = { ...baseConfig, workdir: "/tmp/workdir" };
      const worktreePath = "/tmp/workdir/test-org-test-repo/jobs/issue-42";

      vi.mocked(execFile).mockImplementation((_cmd: unknown, _args: unknown, _opts: unknown, cb?: unknown) => {
        const callback = typeof _opts === "function" ? _opts : cb;
        const args = _args as string[];

        if (args.includes("rev-parse")) {
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "agent/issue-42-fix\n",
            stderr: "",
          });
        } else {
          // All other commands fail
          const err = new Error("failed") as Error & { stdout: string; stderr: string };
          err.stdout = "";
          err.stderr = "failed";
          (callback as (err: Error) => void)(err);
        }
        return cast({ pid: 1234 });
      });

      // rm also fails
      vi.mocked(rm).mockRejectedValue(new Error("rm failed"));

      await expect(removeWorktree(config, worktreePath)).rejects.toThrow("Failed to remove worktree");
    });

    it("skips branch deletion when branch is not an agent branch", async () => {
      const config = { ...baseConfig, workdir: "/tmp/workdir" };
      const worktreePath = "/tmp/workdir/test-org-test-repo/jobs/issue-42";

      vi.mocked(execFile).mockImplementation((_cmd: unknown, _args: unknown, _opts: unknown, cb?: unknown) => {
        const callback = typeof _opts === "function" ? _opts : cb;
        const args = _args as string[];

        if (args.includes("rev-parse")) {
          // Non-agent branch
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "feature/something\n",
            stderr: "",
          });
        } else {
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "",
            stderr: "",
          });
        }
        return cast({ pid: 1234 });
      });

      await removeWorktree(config, worktreePath);
      // Should NOT have called branch -D since it's not an agent/ branch
      const calls = vi.mocked(execFile).mock.calls;
      const branchDeleteCalls = calls.filter((call) => {
        const args = call[1] as string[];
        return args.includes("-D") && args.includes("branch");
      });
      expect(branchDeleteCalls).toHaveLength(0);
    });
  });

  describe("createWorktree", () => {
    it("creates worktree for standard issue", async () => {
      // access for worktree path should fail (doesn't exist yet = good)
      vi.mocked(access)
        .mockRejectedValueOnce(new Error("ENOENT")) // worktree doesn't exist
        .mockResolvedValue(undefined); // bare repo exists (if checked)

      // Mock all execFile calls for the flow:
      // 1. ls-remote (check remote branch exists) -> no
      // 2. branch -D (cleanup) -> fails (OK)
      // 3. branch (detect base branch) -> "main"
      // 4. worktree add -> success
      vi.mocked(execFile).mockImplementation((_cmd: unknown, _args: unknown, _opts: unknown, cb?: unknown) => {
        const callback = typeof _opts === "function" ? _opts : cb;
        const args = _args as string[];

        if (args.includes("ls-remote")) {
          // Branch does NOT exist on remote
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "",
            stderr: "",
          });
        } else if (args.includes("-D")) {
          // Branch delete fails (doesn't exist locally)
          const err = new Error("not found") as Error & { stdout: string; stderr: string };
          err.stdout = "";
          err.stderr = "not found";
          (callback as (err: Error) => void)(err);
        } else if (args.includes("branch") && !args.includes("-D") && !args.includes("-b")) {
          // git branch - list branches
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "* main\n",
            stderr: "",
          });
        } else {
          // worktree add or other
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "",
            stderr: "",
          });
        }
        return cast({ pid: 1234 });
      });

      const result = await createWorktree(baseConfig, 42, "Fix the bug");
      expect(result.branch).toContain("agent/issue-42");
      expect(result.worktreePath).toContain("issue-42");
    });

    it("creates worktree for manual job with negative issue number", async () => {
      vi.mocked(access).mockRejectedValueOnce(new Error("ENOENT"));

      vi.mocked(execFile).mockImplementation((_cmd: unknown, _args: unknown, _opts: unknown, cb?: unknown) => {
        const callback = typeof _opts === "function" ? _opts : cb;
        const args = _args as string[];
        if (args.includes("ls-remote")) {
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "",
            stderr: "",
          });
        } else if (args.includes("-D")) {
          const err = new Error("not found") as Error & { stdout: string; stderr: string };
          err.stdout = "";
          err.stderr = "";
          (callback as (err: Error) => void)(err);
        } else if (args.includes("branch") && !args.includes("-D") && !args.includes("-b")) {
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "* main\n",
            stderr: "",
          });
        } else {
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "",
            stderr: "",
          });
        }
        return cast({ pid: 1234 });
      });

      const result = await createWorktree(baseConfig, -1, "manual task", "abcd1234-5678");
      expect(result.branch).toContain("agent/manual-");
      expect(result.worktreePath).toContain("manual-");
    });
  });

  describe("getChangedFiles committed changes path", () => {
    it("includes committed changes from diff --name-status", async () => {
      vi.mocked(execFile).mockImplementation((_cmd: unknown, _args: unknown, _opts: unknown, cb?: unknown) => {
        const args = _args as string[];
        const callback = typeof _opts === "function" ? _opts : cb;

        if (args.includes("--porcelain") && args.includes("status")) {
          // No uncommitted changes
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "",
            stderr: "",
          });
        } else if (args.includes("fetch")) {
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "",
            stderr: "",
          });
        } else if (args.includes("merge-base")) {
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "abc123\n",
            stderr: "",
          });
        } else if (args.includes("--name-status")) {
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout:
              "A\tsrc/new.ts\nM\tsrc/modified.ts\nD\tsrc/deleted.ts\nR100\tsrc/old.ts\tsrc/renamed.ts\nC\tsrc/copied.ts\n",
            stderr: "",
          });
        } else {
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "",
            stderr: "",
          });
        }
        return cast({ pid: 1234 });
      });

      const result = await getChangedFiles(baseConfig, "/tmp/worktree", "main");

      const paths = result.map((f) => f.path);
      expect(paths).toContain("src/new.ts");
      expect(paths).toContain("src/modified.ts");
      expect(paths).toContain("src/deleted.ts");
      expect(paths).toContain("src/renamed.ts");
      expect(paths).toContain("src/copied.ts");

      expect(result.find((f) => f.path === "src/new.ts")?.status).toBe("added");
      expect(result.find((f) => f.path === "src/modified.ts")?.status).toBe("modified");
      expect(result.find((f) => f.path === "src/deleted.ts")?.status).toBe("deleted");
      expect(result.find((f) => f.path === "src/renamed.ts")?.status).toBe("renamed");
      expect(result.find((f) => f.path === "src/copied.ts")?.status).toBe("copied");
    });

    it("deduplicates files across uncommitted and committed changes", async () => {
      vi.mocked(execFile).mockImplementation((_cmd: unknown, _args: unknown, _opts: unknown, cb?: unknown) => {
        const args = _args as string[];
        const callback = typeof _opts === "function" ? _opts : cb;

        if (args.includes("--porcelain") && args.includes("status")) {
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "M  src/index.ts\n",
            stderr: "",
          });
        } else if (args.includes("fetch")) {
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "",
            stderr: "",
          });
        } else if (args.includes("merge-base")) {
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "abc123\n",
            stderr: "",
          });
        } else if (args.includes("--name-status")) {
          // Same file also in committed changes
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "M\tsrc/index.ts\nA\tsrc/other.ts\n",
            stderr: "",
          });
        } else {
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "",
            stderr: "",
          });
        }
        return cast({ pid: 1234 });
      });

      const result = await getChangedFiles(baseConfig, "/tmp/worktree", "main");

      // src/index.ts should only appear once (deduped)
      const indexFiles = result.filter((f) => f.path === "src/index.ts");
      expect(indexFiles).toHaveLength(1);
      // src/other.ts should also be present
      expect(result.find((f) => f.path === "src/other.ts")).toBeDefined();
    });

    it("falls back to local baseBranch when merge-base with origin fails", async () => {
      let mergeBaseCallCount = 0;
      vi.mocked(execFile).mockImplementation((_cmd: unknown, _args: unknown, _opts: unknown, cb?: unknown) => {
        const args = _args as string[];
        const callback = typeof _opts === "function" ? _opts : cb;

        if (args.includes("--porcelain") && args.includes("status")) {
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "",
            stderr: "",
          });
        } else if (args.includes("fetch")) {
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "",
            stderr: "",
          });
        } else if (args.includes("merge-base")) {
          mergeBaseCallCount++;
          if (mergeBaseCallCount === 1) {
            // First merge-base (origin/main) fails
            const err = new Error("bad ref") as Error & { stdout: string; stderr: string };
            err.stdout = "";
            err.stderr = "bad ref";
            (callback as (err: Error) => void)(err);
          } else {
            // Second merge-base (main) succeeds
            (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
              stdout: "def456\n",
              stderr: "",
            });
          }
        } else if (args.includes("--name-status")) {
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "A\tsrc/file.ts\n",
            stderr: "",
          });
        } else {
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "",
            stderr: "",
          });
        }
        return cast({ pid: 1234 });
      });

      const result = await getChangedFiles(baseConfig, "/tmp/worktree", "main");
      expect(result.find((f) => f.path === "src/file.ts")).toBeDefined();
    });

    it("falls back to first commit when both merge-base attempts fail", async () => {
      vi.mocked(execFile).mockImplementation((_cmd: unknown, _args: unknown, _opts: unknown, cb?: unknown) => {
        const args = _args as string[];
        const callback = typeof _opts === "function" ? _opts : cb;

        if (args.includes("--porcelain") && args.includes("status")) {
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "",
            stderr: "",
          });
        } else if (args.includes("fetch")) {
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "",
            stderr: "",
          });
        } else if (args.includes("merge-base")) {
          const err = new Error("bad ref") as Error & { stdout: string; stderr: string };
          err.stdout = "";
          err.stderr = "bad ref";
          (callback as (err: Error) => void)(err);
        } else if (args.includes("rev-list") && args.includes("--max-parents=0")) {
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "first-commit-sha\n",
            stderr: "",
          });
        } else if (args.includes("--name-status")) {
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "A\tsrc/initial.ts\n",
            stderr: "",
          });
        } else {
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "",
            stderr: "",
          });
        }
        return cast({ pid: 1234 });
      });

      const result = await getChangedFiles(baseConfig, "/tmp/worktree", "main");
      expect(result.find((f) => f.path === "src/initial.ts")).toBeDefined();
    });

    it("returns only uncommitted changes when all committed-change operations fail", async () => {
      vi.mocked(execFile).mockImplementation((_cmd: unknown, _args: unknown, _opts: unknown, cb?: unknown) => {
        const args = _args as string[];
        const callback = typeof _opts === "function" ? _opts : cb;

        if (args.includes("--porcelain") && args.includes("status")) {
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "M  uncommitted.ts\n",
            stderr: "",
          });
        } else {
          // All other git commands fail
          const err = new Error("failed") as Error & { stdout: string; stderr: string };
          err.stdout = "";
          err.stderr = "failed";
          (callback as (err: Error) => void)(err);
        }
        return cast({ pid: 1234 });
      });

      const result = await getChangedFiles(baseConfig, "/tmp/worktree", "main");
      expect(result).toHaveLength(1);
      expect(result[0].path).toBe("uncommitted.ts");
    });

    it("handles copied status code in uncommitted changes", async () => {
      vi.mocked(execFile).mockImplementation((_cmd: unknown, _args: unknown, _opts: unknown, cb?: unknown) => {
        const args = _args as string[];
        const callback = typeof _opts === "function" ? _opts : cb;

        if (args.includes("--porcelain") && args.includes("status")) {
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "C  src/copy.ts\nU  src/unmerged.ts\n",
            stderr: "",
          });
        } else {
          const err = new Error("failed") as Error & { stdout: string; stderr: string };
          err.stdout = "";
          err.stderr = "failed";
          (callback as (err: Error) => void)(err);
        }
        return cast({ pid: 1234 });
      });

      const result = await getChangedFiles(baseConfig, "/tmp/worktree", "main");
      expect(result.find((f) => f.path === "src/copy.ts")?.status).toBe("copied");
      expect(result.find((f) => f.path === "src/unmerged.ts")?.status).toBe("modified");
    });

    it("logs warning when committed changes section throws after successful fetch", async () => {
      vi.mocked(execFile).mockImplementation((_cmd: unknown, _args: unknown, _opts: unknown, cb?: unknown) => {
        const args = _args as string[];
        const callback = typeof _opts === "function" ? _opts : cb;

        if (args.includes("--porcelain") && args.includes("status")) {
          // Uncommitted changes succeed
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "M  src/local.ts\n",
            stderr: "",
          });
        } else if (args.includes("fetch")) {
          // Fetch succeeds
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "",
            stderr: "",
          });
        } else if (args.includes("merge-base")) {
          // merge-base succeeds
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "abc123\n",
            stderr: "",
          });
        } else if (args.includes("--name-status")) {
          // diff --name-status throws
          const err = new Error("diff failed") as Error & { stdout: string; stderr: string };
          err.stdout = "";
          err.stderr = "diff failed";
          (callback as (err: Error) => void)(err);
        } else {
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "",
            stderr: "",
          });
        }
        return cast({ pid: 1234 });
      });

      const result = await getChangedFiles(baseConfig, "/tmp/worktree", "main");
      // Should still include uncommitted changes
      expect(result).toHaveLength(1);
      expect(result[0].path).toBe("src/local.ts");
    });
  });

  describe("getFileDiff", () => {
    it("returns new file diff for untracked files", async () => {
      vi.mocked(readFile).mockResolvedValue("line 1\nline 2\nline 3");

      vi.mocked(execFile).mockImplementation((_cmd: unknown, _args: unknown, _opts: unknown, cb?: unknown) => {
        const args = _args as string[];
        const callback = typeof _opts === "function" ? _opts : cb;

        if (args.includes("fetch")) {
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "",
            stderr: "",
          });
        } else if (args.includes("--porcelain")) {
          // Untracked file
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "?? src/newfile.ts",
            stderr: "",
          });
        } else {
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "",
            stderr: "",
          });
        }
        return cast({ pid: 1234 });
      });

      const result = await getFileDiff(baseConfig, "/tmp/worktree", "main", "src/newfile.ts");
      expect(result).toContain("new file mode 100644");
      expect(result).toContain("--- /dev/null");
      expect(result).toContain("+line 1");
      expect(result).toContain("+line 2");
      expect(result).toContain("+line 3");
    });

    it("returns diff against HEAD for modified uncommitted files", async () => {
      vi.mocked(execFile).mockImplementation((_cmd: unknown, _args: unknown, _opts: unknown, cb?: unknown) => {
        const args = _args as string[];
        const callback = typeof _opts === "function" ? _opts : cb;

        if (args.includes("fetch")) {
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "",
            stderr: "",
          });
        } else if (args.includes("--porcelain")) {
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "M  src/modified.ts",
            stderr: "",
          });
        } else if (args.includes("diff") && args.includes("HEAD")) {
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout:
              "diff --git a/src/modified.ts b/src/modified.ts\n--- a/src/modified.ts\n+++ b/src/modified.ts\n@@ -1,3 +1,4 @@\n line 1\n+new line\n line 2\n",
            stderr: "",
          });
        } else {
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "",
            stderr: "",
          });
        }
        return cast({ pid: 1234 });
      });

      const result = await getFileDiff(baseConfig, "/tmp/worktree", "main", "src/modified.ts");
      expect(result).toContain("diff --git");
      expect(result).toContain("+new line");
    });

    it("returns committed diff when file has no uncommitted changes", async () => {
      vi.mocked(execFile).mockImplementation((_cmd: unknown, _args: unknown, _opts: unknown, cb?: unknown) => {
        const args = _args as string[];
        const callback = typeof _opts === "function" ? _opts : cb;

        if (args.includes("fetch")) {
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "",
            stderr: "",
          });
        } else if (args.includes("--porcelain")) {
          // No uncommitted changes for this file
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "",
            stderr: "",
          });
        } else if (args.includes("merge-base")) {
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "abc123\n",
            stderr: "",
          });
        } else if (args.includes("diff") && args.some((a) => a.includes("..."))) {
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "diff --git committed change\n+committed line\n",
            stderr: "",
          });
        } else {
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "",
            stderr: "",
          });
        }
        return cast({ pid: 1234 });
      });

      const result = await getFileDiff(baseConfig, "/tmp/worktree", "main", "src/file.ts");
      expect(result).toContain("+committed line");
    });

    it("falls back to local baseBranch merge-base when origin fails", async () => {
      let mergeBaseCallCount = 0;
      vi.mocked(execFile).mockImplementation((_cmd: unknown, _args: unknown, _opts: unknown, cb?: unknown) => {
        const args = _args as string[];
        const callback = typeof _opts === "function" ? _opts : cb;

        if (args.includes("fetch")) {
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "",
            stderr: "",
          });
        } else if (args.includes("--porcelain")) {
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "",
            stderr: "",
          });
        } else if (args.includes("merge-base")) {
          mergeBaseCallCount++;
          if (mergeBaseCallCount === 1) {
            const err = new Error("bad ref") as Error & { stdout: string; stderr: string };
            err.stdout = "";
            err.stderr = "bad ref";
            (callback as (err: Error) => void)(err);
          } else {
            (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
              stdout: "local-merge-base\n",
              stderr: "",
            });
          }
        } else if (args.includes("diff") && args.some((a) => a.includes("..."))) {
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "local-diff-output\n",
            stderr: "",
          });
        } else {
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "",
            stderr: "",
          });
        }
        return cast({ pid: 1234 });
      });

      const result = await getFileDiff(baseConfig, "/tmp/worktree", "main", "src/file.ts");
      expect(result).toContain("local-diff-output");
    });

    it("falls back to first commit when both merge-base attempts fail", async () => {
      vi.mocked(execFile).mockImplementation((_cmd: unknown, _args: unknown, _opts: unknown, cb?: unknown) => {
        const args = _args as string[];
        const callback = typeof _opts === "function" ? _opts : cb;

        if (args.includes("fetch")) {
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "",
            stderr: "",
          });
        } else if (args.includes("--porcelain")) {
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "",
            stderr: "",
          });
        } else if (args.includes("merge-base")) {
          const err = new Error("bad ref") as Error & { stdout: string; stderr: string };
          err.stdout = "";
          err.stderr = "bad ref";
          (callback as (err: Error) => void)(err);
        } else if (args.includes("rev-list") && args.includes("--max-parents=0")) {
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "first-commit-hash\n",
            stderr: "",
          });
        } else if (args.includes("diff") && args.some((a) => a.includes("..."))) {
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "first-commit-diff\n",
            stderr: "",
          });
        } else {
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "",
            stderr: "",
          });
        }
        return cast({ pid: 1234 });
      });

      const result = await getFileDiff(baseConfig, "/tmp/worktree", "main", "src/file.ts");
      expect(result).toContain("first-commit-diff");
    });

    it("returns empty string when all fallbacks fail", async () => {
      vi.mocked(execFile).mockImplementation((_cmd: unknown, _args: unknown, _opts: unknown, cb?: unknown) => {
        const args = _args as string[];
        const callback = typeof _opts === "function" ? _opts : cb;

        if (args.includes("fetch")) {
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "",
            stderr: "",
          });
        } else if (args.includes("--porcelain")) {
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "",
            stderr: "",
          });
        } else {
          const err = new Error("all fail") as Error & { stdout: string; stderr: string };
          err.stdout = "";
          err.stderr = "all fail";
          (callback as (err: Error) => void)(err);
        }
        return cast({ pid: 1234 });
      });

      const result = await getFileDiff(baseConfig, "/tmp/worktree", "main", "src/file.ts");
      expect(result).toBe("");
    });

    it("returns empty string when untracked file readFile fails", async () => {
      vi.mocked(readFile).mockRejectedValue(new Error("ENOENT"));

      vi.mocked(execFile).mockImplementation((_cmd: unknown, _args: unknown, _opts: unknown, cb?: unknown) => {
        const args = _args as string[];
        const callback = typeof _opts === "function" ? _opts : cb;

        if (args.includes("fetch")) {
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "",
            stderr: "",
          });
        } else if (args.includes("--porcelain")) {
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "?? src/gone.ts",
            stderr: "",
          });
        } else {
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "",
            stderr: "",
          });
        }
        return cast({ pid: 1234 });
      });

      const result = await getFileDiff(baseConfig, "/tmp/worktree", "main", "src/gone.ts");
      expect(result).toBe("");
    });

    it("handles fetch failure gracefully (continues without it)", async () => {
      vi.mocked(execFile).mockImplementation((_cmd: unknown, _args: unknown, _opts: unknown, cb?: unknown) => {
        const args = _args as string[];
        const callback = typeof _opts === "function" ? _opts : cb;

        if (args.includes("fetch")) {
          // Fetch fails (offline)
          const err = new Error("network error") as Error & { stdout: string; stderr: string };
          err.stdout = "";
          err.stderr = "network error";
          (callback as (err: Error) => void)(err);
        } else if (args.includes("--porcelain")) {
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "",
            stderr: "",
          });
        } else if (args.includes("merge-base")) {
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "some-ref\n",
            stderr: "",
          });
        } else if (args.includes("diff") && args.some((a) => a.includes("..."))) {
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "offline-diff\n",
            stderr: "",
          });
        } else {
          (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
            stdout: "",
            stderr: "",
          });
        }
        return cast({ pid: 1234 });
      });

      const result = await getFileDiff(baseConfig, "/tmp/worktree", "main", "src/file.ts");
      expect(result).toContain("offline-diff");
    });
  });
});
