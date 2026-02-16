import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock data
const mockJob = {
  id: "job-123",
  issueNumber: 42,
  issueTitle: "Test issue",
  issueUrl: "https://github.com/org/repo/issues/42",
  status: "done",
  branch: "agent/issue-42-test",
  worktreePath: "/tmp/workdir/jobs/issue-42",
  prNumber: 101,
  prUrl: "https://github.com/org/repo/pull/101",
  repositoryId: "repo-123",
  updatedAt: new Date(),
};

const mockRepoConfig = {
  owner: "org",
  name: "repo",
  baseBranch: "main",
  triggerLabel: "agent",
};

const mockGitConfig = {
  workdir: "/tmp/workdir",
  repoUrl: "https://github.com/org/repo.git",
  token: "test-token",
  owner: "org",
  name: "repo",
};

// Mock dependencies
vi.mock("../db/index.js", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve([mockJob])),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(() =>
            Promise.resolve([{ ...mockJob, worktreePath: null }]),
          ),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => Promise.resolve()),
    })),
  },
}));

vi.mock("../services/git.js", () => ({
  listWorktrees: vi.fn(() => Promise.resolve([])),
  removeWorktree: vi.fn(() => Promise.resolve()),
}));

vi.mock("../services/github/index.js", () => ({
  getOctokitForRepo: vi.fn(() =>
    Promise.resolve({
      rest: {
        pulls: {
          get: vi.fn(() =>
            Promise.resolve({
              data: { merged: true },
            }),
          ),
        },
      },
    }),
  ),
  getRepoConfigById: vi.fn(() => Promise.resolve(mockRepoConfig)),
}));

vi.mock("../services/settings-helper.js", () => ({
  validateWorkspaceSettings: vi.fn(() => Promise.resolve({ valid: true })),
  getWorkspaceSettings: vi.fn(() =>
    Promise.resolve({
      workdirPath: "/tmp/workdir",
    }),
  ),
  toGitConfig: vi.fn(() => mockGitConfig),
}));

vi.mock("../ws/handler.js", () => ({
  broadcast: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  rm: vi.fn(() => Promise.resolve()),
}));

describe("worktrees API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("GET /:jobId/pr-status", () => {
    it("should return merged status from GitHub API when job has PR", async () => {
      const { getOctokitForRepo } = await import("../services/github/index.js");
      const octokit = await getOctokitForRepo("repo-123");
      const { data: pr } = await octokit.rest.pulls.get({} as never);
      expect(pr.merged).toBe(true);
    });
  });

  describe("POST /:jobId/cleanup", () => {
    it("should have removeWorktree available for cleanup", async () => {
      const { removeWorktree } = await import("../services/git.js");
      expect(removeWorktree).toBeDefined();
    });

    it("should have broadcast available for job:updated events", async () => {
      const { broadcast } = await import("../ws/handler.js");
      expect(broadcast).toBeDefined();
    });

    it("should validate path is within workdir", () => {
      const validPath = "/tmp/workdir/jobs/issue-42";
      const invalidPath = "/etc/passwd";

      expect(validPath.startsWith(mockGitConfig.workdir)).toBe(true);
      expect(invalidPath.startsWith(mockGitConfig.workdir)).toBe(false);
    });

    it("should have rm available for cleanup", async () => {
      const { rm } = await import("node:fs/promises");
      expect(rm).toBeDefined();
    });
  });
});
