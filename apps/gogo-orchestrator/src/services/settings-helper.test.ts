import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/index.js", () => ({
  getDb: vi.fn(async () => ({})),
}));

vi.mock("@claudekit/duckdb", () => ({
  queryAll: vi.fn(),
  queryOne: vi.fn(),
  parseJsonField: vi.fn((value: string, _default: unknown) => {
    try {
      return JSON.parse(value);
    } catch {
      return _default;
    }
  }),
}));

import { queryAll, queryOne } from "@claudekit/duckdb";
import { getClaudeSettings, toGitConfigFromRepo, validateStartupSettings } from "./settings-helper.js";

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

  it("uses provided baseBranch when specified", () => {
    const repo = {
      owner: "org",
      name: "repo",
      githubToken: "token",
      workdirPath: "/tmp",
      baseBranch: "develop",
    };

    const config = toGitConfigFromRepo(repo);
    expect(config.baseBranch).toBe("develop");
  });

  it("defaults to main when baseBranch is empty string", () => {
    const repo = {
      owner: "org",
      name: "repo",
      githubToken: "token",
      workdirPath: "/tmp",
      baseBranch: "",
    };

    const config = toGitConfigFromRepo(repo);
    expect(config.baseBranch).toBe("main");
  });
});

describe("getClaudeSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns defaults when no saved settings", async () => {
    vi.mocked(queryOne).mockResolvedValueOnce(undefined);

    const settings = await getClaudeSettings();

    expect(settings).toEqual({
      enabled: true,
      max_runtime_ms: 7200000,
      max_parallel_jobs: 3,
      test_command: "npm test",
    });
  });

  it("merges saved settings with defaults", async () => {
    vi.mocked(queryOne).mockResolvedValueOnce({
      key: "claude_code",
      value: JSON.stringify({ max_parallel_jobs: 5, test_command: "pnpm test" }),
    });

    const settings = await getClaudeSettings();

    expect(settings.max_parallel_jobs).toBe(5);
    expect(settings.test_command).toBe("pnpm test");
    expect(settings.enabled).toBe(true); // default
    expect(settings.max_runtime_ms).toBe(7200000); // default
  });

  it("uses saved enabled=false correctly", async () => {
    vi.mocked(queryOne).mockResolvedValueOnce({
      key: "claude_code",
      value: JSON.stringify({ enabled: false }),
    });

    const settings = await getClaudeSettings();
    expect(settings.enabled).toBe(false);
  });
});

describe("validateStartupSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("warns when no active repositories", async () => {
    vi.mocked(queryAll).mockResolvedValueOnce([]);

    const result = await validateStartupSettings();

    expect(result.ready).toBe(true);
    expect(result.hasActiveRepositories).toBe(false);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("No active repositories");
    expect(result.errors).toHaveLength(0);
  });

  it("returns ready with valid repos", async () => {
    vi.mocked(queryAll).mockResolvedValueOnce([{ id: "r1", owner: "org", name: "repo" }]);
    vi.mocked(queryOne).mockResolvedValueOnce({
      github_token: "ghp_token",
      workdir_path: "/tmp/work",
    });

    const result = await validateStartupSettings();

    expect(result.ready).toBe(true);
    expect(result.hasActiveRepositories).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it("errors when repo missing github token", async () => {
    vi.mocked(queryAll).mockResolvedValueOnce([{ id: "r1", owner: "org", name: "repo" }]);
    vi.mocked(queryOne).mockResolvedValueOnce({
      github_token: null,
      workdir_path: "/tmp/work",
    });

    const result = await validateStartupSettings();

    expect(result.ready).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("missing GitHub token");
  });

  it("errors when repo missing workdir path", async () => {
    vi.mocked(queryAll).mockResolvedValueOnce([{ id: "r1", owner: "org", name: "repo" }]);
    vi.mocked(queryOne).mockResolvedValueOnce({
      github_token: "token",
      workdir_path: null,
    });

    const result = await validateStartupSettings();

    expect(result.ready).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("missing workspace directory");
  });

  it("collects multiple errors across repos", async () => {
    vi.mocked(queryAll).mockResolvedValueOnce([
      { id: "r1", owner: "org1", name: "repo1" },
      { id: "r2", owner: "org2", name: "repo2" },
    ]);
    vi.mocked(queryOne)
      .mockResolvedValueOnce({ github_token: null, workdir_path: null }) // r1: both missing
      .mockResolvedValueOnce({ github_token: "tok", workdir_path: null }); // r2: missing workdir

    const result = await validateStartupSettings();

    expect(result.ready).toBe(false);
    expect(result.errors).toHaveLength(3); // r1: 2 errors + r2: 1 error
  });
});
