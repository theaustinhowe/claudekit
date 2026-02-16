import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type GitConfig, getBareRepoPath, getJobsDir, getRepoDir, getRepoSlug } from "./git.js";

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
      // Path traversal attempts should be sanitized
      expect(getRepoSlug("../../../etc", "passwd")).toBe("etc-passwd");
      expect(getRepoSlug("..%2F..%2F", "hack")).toBe("2f-2f-hack");
    });

    it("handles slashes in names", () => {
      // Slashes become dashes
      expect(getRepoSlug("org/sub", "repo/part")).toBe("org-sub-repo-part");
    });
  });

  describe("getRepoDir", () => {
    it("returns workdir + slug", () => {
      expect(getRepoDir(baseConfig)).toBe("/path/to/workdir/my-org-my-repo");
    });

    it("normalizes owner and name", () => {
      const config: GitConfig = {
        ...baseConfig,
        owner: "MyOrg",
        name: "MyRepo",
      };
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
      const configA: GitConfig = {
        ...baseConfig,
        owner: "org-a",
        name: "repo-a",
      };
      const configB: GitConfig = {
        ...baseConfig,
        owner: "org-b",
        name: "repo-b",
      };

      expect(getRepoDir(configA)).not.toBe(getRepoDir(configB));
      expect(getBareRepoPath(configA)).not.toBe(getBareRepoPath(configB));
      expect(getJobsDir(configA)).not.toBe(getJobsDir(configB));
    });

    it("same repo name different orgs get different directories", () => {
      const configA: GitConfig = {
        ...baseConfig,
        owner: "org-a",
        name: "shared-repo",
      };
      const configB: GitConfig = {
        ...baseConfig,
        owner: "org-b",
        name: "shared-repo",
      };

      expect(getRepoDir(configA)).not.toBe(getRepoDir(configB));
    });

    it("repos share same workdir but have isolated directories", () => {
      const sharedWorkdir = "/shared/workdir";
      const configA: GitConfig = {
        ...baseConfig,
        workdir: sharedWorkdir,
        owner: "org-a",
        name: "repo-a",
      };
      const configB: GitConfig = {
        ...baseConfig,
        workdir: sharedWorkdir,
        owner: "org-b",
        name: "repo-b",
      };

      // Both start with shared workdir
      expect(getRepoDir(configA).startsWith(sharedWorkdir)).toBe(true);
      expect(getRepoDir(configB).startsWith(sharedWorkdir)).toBe(true);

      // But are different paths
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
});
