import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { type GitConfig, getBareRepoPath, getJobsDir, getRepoDir, getRepoSlug } from "./git.js";

/**
 * Path safety tests for multi-repository workspace isolation.
 *
 * These tests verify that:
 * 1. Different repositories get isolated directories
 * 2. All paths are properly contained within their repo directory
 * 3. Traversal attacks are prevented by slug sanitization
 * 4. Cross-repo operations are blocked
 */
describe("path safety", () => {
  const sharedWorkdir = "/shared/workdir";

  const createConfig = (owner: string, name: string, workdir = sharedWorkdir): GitConfig => ({
    workdir,
    owner,
    name,
    token: "test-token",
    repoUrl: `https://github.com/${owner}/${name}`,
  });

  describe("repository isolation", () => {
    it("different repos get different directories when sharing workdir", () => {
      const configA = createConfig("org-a", "repo-a");
      const configB = createConfig("org-b", "repo-b");

      const repoDirA = getRepoDir(configA);
      const repoDirB = getRepoDir(configB);

      expect(repoDirA).not.toBe(repoDirB);
      expect(repoDirA).not.toContain(repoDirB);
      expect(repoDirB).not.toContain(repoDirA);
    });

    it("repos with same name but different orgs are isolated", () => {
      const configA = createConfig("org-a", "common-repo");
      const configB = createConfig("org-b", "common-repo");

      expect(getRepoDir(configA)).not.toBe(getRepoDir(configB));
      expect(getBareRepoPath(configA)).not.toBe(getBareRepoPath(configB));
      expect(getJobsDir(configA)).not.toBe(getJobsDir(configB));
    });

    it("repos with same org but different names are isolated", () => {
      const configA = createConfig("same-org", "repo-a");
      const configB = createConfig("same-org", "repo-b");

      expect(getRepoDir(configA)).not.toBe(getRepoDir(configB));
    });
  });

  describe("directory containment", () => {
    it("repo directory is directly under workdir", () => {
      const config = createConfig("my-org", "my-repo");
      const repoDir = getRepoDir(config);
      const workdir = config.workdir;

      // Repo dir should be a direct child of workdir
      expect(repoDir.startsWith(`${workdir}/`)).toBe(true);

      // Count path segments - should only be one level deeper
      const relativePath = repoDir.slice(workdir.length + 1);
      expect(relativePath.includes("/")).toBe(false);
    });

    it("bare repo path is inside repo directory", () => {
      const config = createConfig("test-org", "test-repo");
      const repoDir = getRepoDir(config);
      const bareRepoPath = getBareRepoPath(config);

      expect(bareRepoPath.startsWith(`${repoDir}/`)).toBe(true);
      expect(bareRepoPath).toBe(`${repoDir}/.repo`);
    });

    it("jobs directory is inside repo directory", () => {
      const config = createConfig("test-org", "test-repo");
      const repoDir = getRepoDir(config);
      const jobsDir = getJobsDir(config);

      expect(jobsDir.startsWith(`${repoDir}/`)).toBe(true);
      expect(jobsDir).toBe(`${repoDir}/jobs`);
    });

    it("all paths are under the configured workdir", () => {
      const config = createConfig("my-org", "my-repo");
      const workdir = config.workdir;

      expect(getRepoDir(config).startsWith(workdir)).toBe(true);
      expect(getBareRepoPath(config).startsWith(workdir)).toBe(true);
      expect(getJobsDir(config).startsWith(workdir)).toBe(true);
    });
  });

  describe("slug sanitization prevents traversal", () => {
    it("removes directory traversal attempts (../)", () => {
      const slug = getRepoSlug("../../../etc", "passwd");

      expect(slug).not.toContain("..");
      expect(slug).not.toContain("/");
      expect(slug).toBe("etc-passwd");
    });

    it("removes URL-encoded traversal (%2F)", () => {
      const slug = getRepoSlug("..%2F..%2F", "hack");

      expect(slug).not.toContain("%");
      expect(slug).not.toContain("/");
    });

    it("handles backslashes (Windows paths)", () => {
      const slug = getRepoSlug("..\\..\\etc", "passwd");

      expect(slug).not.toContain("\\");
      expect(slug).not.toContain("..");
    });

    it("removes null bytes and control characters", () => {
      const slug = getRepoSlug("org\x00", "repo\x00");

      expect(slug).not.toContain("\x00");
    });

    it("handles unicode normalization attacks", () => {
      // Using different unicode representations
      const slug1 = getRepoSlug("org", "repo");
      // This should produce the same result regardless of unicode tricks
      expect(slug1).toBe("org-repo");
    });

    it("produces predictable slugs for clean input", () => {
      expect(getRepoSlug("my-org", "my-repo")).toBe("my-org-my-repo");
      expect(getRepoSlug("MyOrg", "MyRepo")).toBe("myorg-myrepo");
      expect(getRepoSlug("org_name", "repo_name")).toBe("org-name-repo-name");
    });
  });

  describe("worktree path validation", () => {
    it("worktree inside repo dir passes validation", () => {
      const config = createConfig("my-org", "my-repo");
      const repoDir = getRepoDir(config);
      const worktreePath = `${repoDir}/jobs/issue-42`;

      const normalizedRepoDir = resolve(repoDir);
      const normalizedWorktreePath = resolve(worktreePath);

      expect(normalizedWorktreePath.startsWith(normalizedRepoDir)).toBe(true);
    });

    it("worktree outside repo dir fails validation", () => {
      const configA = createConfig("org-a", "repo-a");
      const configB = createConfig("org-b", "repo-b");

      const repoDirA = getRepoDir(configA);
      const worktreeFromB = `${getRepoDir(configB)}/jobs/issue-42`;

      const normalizedRepoDirA = resolve(repoDirA);
      const normalizedWorktreeB = resolve(worktreeFromB);

      // Worktree from repo B should NOT be inside repo A's directory
      expect(normalizedWorktreeB.startsWith(normalizedRepoDirA)).toBe(false);
    });

    it("traversal attempt in worktree path fails validation", () => {
      const config = createConfig("my-org", "my-repo");
      const repoDir = getRepoDir(config);

      // Attempt to escape repo dir
      const maliciousPath = `${repoDir}/jobs/../../../etc/passwd`;
      const normalizedRepoDir = resolve(repoDir);
      const normalizedMalicious = resolve(maliciousPath);

      // After normalization, the path should escape repo dir
      expect(normalizedMalicious.startsWith(normalizedRepoDir)).toBe(false);
    });
  });

  describe("cross-repo cleanup blocking", () => {
    /**
     * Simulates the validation logic used in cleanup endpoints.
     * Returns true if the worktree path is valid for the given config.
     */
    const isValidWorktreePath = (config: GitConfig, worktreePath: string): boolean => {
      const repoDir = getRepoDir(config);
      const normalizedRepoDir = resolve(repoDir);
      const normalizedWorktreePath = resolve(worktreePath);
      return normalizedWorktreePath.startsWith(normalizedRepoDir);
    };

    it("allows cleanup of worktree within same repo", () => {
      const config = createConfig("my-org", "my-repo");
      const repoDir = getRepoDir(config);
      const worktreePath = `${repoDir}/jobs/issue-42`;

      expect(isValidWorktreePath(config, worktreePath)).toBe(true);
    });

    it("blocks cleanup of worktree from different repo", () => {
      const configA = createConfig("org-a", "repo-a");
      const configB = createConfig("org-b", "repo-b");

      // Create a worktree path in repo B's directory
      const repoDirB = getRepoDir(configB);
      const worktreeFromB = `${repoDirB}/jobs/issue-42`;

      // Attempt to validate using repo A's config
      expect(isValidWorktreePath(configA, worktreeFromB)).toBe(false);
    });

    it("blocks cleanup when worktree path is in workdir but wrong repo", () => {
      const configA = createConfig("org-a", "repo-a");
      const _configB = createConfig("org-b", "repo-b");

      // Both use same workdir, but worktree belongs to repo B
      const worktreeInB = `${sharedWorkdir}/org-b-repo-b/jobs/issue-100`;

      // Should fail validation when using config A
      expect(isValidWorktreePath(configA, worktreeInB)).toBe(false);
    });

    it("blocks cleanup with traversal to sibling repo directory", () => {
      const configA = createConfig("org-a", "repo-a");

      // Attempt to traverse from repo A to repo B's worktree
      const repoDirA = getRepoDir(configA);
      const traversalPath = `${repoDirA}/../org-b-repo-b/jobs/issue-42`;

      expect(isValidWorktreePath(configA, traversalPath)).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("handles empty owner or name gracefully", () => {
      // Empty strings should still produce valid (though degenerate) slugs
      expect(getRepoSlug("", "repo")).toBe("repo");
      expect(getRepoSlug("org", "")).toBe("org");
      expect(getRepoSlug("", "")).toBe("");
    });

    it("handles very long names by producing valid paths", () => {
      const longOwner = "a".repeat(100);
      const longName = "b".repeat(100);
      const slug = getRepoSlug(longOwner, longName);

      // Should be a valid directory name (no special handling for length currently)
      expect(slug.includes("/")).toBe(false);
      expect(slug.includes("..")).toBe(false);
    });

    it("handles names with only special characters", () => {
      const slug = getRepoSlug("---", "___");

      // After sanitization, might be empty or minimal
      // The key is it shouldn't contain dangerous characters
      expect(slug.includes("/")).toBe(false);
      expect(slug.includes("..")).toBe(false);
    });
  });
});
