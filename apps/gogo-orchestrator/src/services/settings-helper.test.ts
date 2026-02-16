import { describe, expect, it } from "vitest";
import { toGitConfigFromRepo } from "./settings-helper.js";

describe("toGitConfigFromRepo", () => {
  it("creates GitConfig from repository record", () => {
    const repo = {
      owner: "my-org",
      name: "my-repo",
      githubToken: "ghp_test123",
      workdirPath: "/path/to/workdir",
    };

    const config = toGitConfigFromRepo(repo);

    expect(config).toEqual({
      workdir: "/path/to/workdir",
      owner: "my-org",
      name: "my-repo",
      token: "ghp_test123",
      repoUrl: "https://github.com/my-org/my-repo",
      baseBranch: "main",
    });
  });

  it("constructs correct GitHub URL", () => {
    const repo = {
      owner: "anthropics",
      name: "claude-code",
      githubToken: "token",
      workdirPath: "/tmp",
    };

    const config = toGitConfigFromRepo(repo);

    expect(config.repoUrl).toBe("https://github.com/anthropics/claude-code");
  });

  it("preserves exact owner and name casing", () => {
    const repo = {
      owner: "MyOrg",
      name: "MyRepo",
      githubToken: "token",
      workdirPath: "/tmp",
    };

    const config = toGitConfigFromRepo(repo);

    // Owner and name should preserve casing (GitHub URLs are case-insensitive but we preserve for display)
    expect(config.owner).toBe("MyOrg");
    expect(config.name).toBe("MyRepo");
  });
});
