import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  expandTilde,
  formatElapsed,
  formatNumber,
  generateId,
  parseGitHubUrl,
  parsePolicy,
  timeAgo,
} from "@/lib/utils";

describe("generateId", () => {
  it("returns a UUID string", () => {
    const id = generateId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("returns unique values", () => {
    const a = generateId();
    const b = generateId();
    expect(a).not.toBe(b);
  });
});

describe("expandTilde", () => {
  const originalHome = process.env.HOME;

  beforeEach(() => {
    process.env.HOME = "/home/testuser";
  });

  afterEach(() => {
    process.env.HOME = originalHome;
  });

  it("expands ~/path to $HOME/path", () => {
    expect(expandTilde("~/projects")).toBe("/home/testuser/projects");
  });

  it("expands standalone ~", () => {
    expect(expandTilde("~")).toBe("/home/testuser");
  });

  it("does not expand ~ in the middle of a path", () => {
    expect(expandTilde("/some/~/path")).toBe("/some/~/path");
  });

  it("returns absolute paths unchanged", () => {
    expect(expandTilde("/usr/local/bin")).toBe("/usr/local/bin");
  });

  it("returns relative paths unchanged", () => {
    expect(expandTilde("relative/path")).toBe("relative/path");
  });
});

describe("parseGitHubUrl", () => {
  it("parses HTTPS GitHub URL", () => {
    expect(parseGitHubUrl("https://github.com/owner/repo")).toEqual({ owner: "owner", repo: "repo" });
  });

  it("parses SSH GitHub URL", () => {
    expect(parseGitHubUrl("git@github.com:owner/repo.git")).toEqual({ owner: "owner", repo: "repo" });
  });

  it("strips .git suffix", () => {
    expect(parseGitHubUrl("https://github.com/owner/repo.git")).toEqual({ owner: "owner", repo: "repo" });
  });

  it("handles URLs with paths after repo", () => {
    expect(parseGitHubUrl("https://github.com/owner/repo/tree/main")).toEqual({ owner: "owner", repo: "repo" });
  });

  it("handles URLs with hash fragments", () => {
    expect(parseGitHubUrl("https://github.com/owner/repo#readme")).toEqual({ owner: "owner", repo: "repo" });
  });

  it("handles URLs with query params", () => {
    expect(parseGitHubUrl("https://github.com/owner/repo?tab=readme")).toEqual({ owner: "owner", repo: "repo" });
  });

  it("returns null for non-GitHub URLs", () => {
    expect(parseGitHubUrl("https://gitlab.com/owner/repo")).toBeNull();
  });

  it("returns null for invalid URLs", () => {
    expect(parseGitHubUrl("not-a-url")).toBeNull();
  });
});

describe("parsePolicy", () => {
  it("parses JSON string fields into proper types", () => {
    const row = {
      id: "p1",
      name: "test",
      expected_versions: '{"node": "20"}',
      banned_dependencies: '[{"name": "lodash", "reason": "too big"}]',
      allowed_package_managers: '["pnpm", "npm"]',
      ignore_patterns: '["node_modules"]',
      generator_defaults: '{"template": "nextjs"}',
      repo_types: '["nextjs"]',
    };
    const policy = parsePolicy(row);
    expect(policy.expected_versions).toEqual({ node: "20" });
    expect(policy.banned_dependencies).toEqual([{ name: "lodash", reason: "too big" }]);
    expect(policy.allowed_package_managers).toEqual(["pnpm", "npm"]);
    expect(policy.ignore_patterns).toEqual(["node_modules"]);
    expect(policy.generator_defaults).toEqual({ template: "nextjs" });
    expect(policy.repo_types).toEqual(["nextjs"]);
  });

  it("defaults missing fields to empty structures", () => {
    const row = {
      id: "p2",
      name: "empty",
      expected_versions: "",
      banned_dependencies: "",
      allowed_package_managers: "",
      ignore_patterns: "",
      generator_defaults: "",
      repo_types: "",
    };
    const policy = parsePolicy(row);
    expect(policy.expected_versions).toEqual({});
    expect(policy.banned_dependencies).toEqual([]);
    expect(policy.allowed_package_managers).toEqual([]);
    expect(policy.ignore_patterns).toEqual([]);
    expect(policy.generator_defaults).toEqual({});
    expect(policy.repo_types).toEqual([]);
  });
});

describe("formatElapsed", () => {
  it("formats seconds only", () => {
    expect(formatElapsed(45)).toBe("45s");
  });

  it("formats 0 seconds", () => {
    expect(formatElapsed(0)).toBe("0s");
  });

  it("formats minutes and seconds", () => {
    expect(formatElapsed(125)).toBe("2m 5s");
  });

  it("formats exact minutes", () => {
    expect(formatElapsed(120)).toBe("2m 0s");
  });
});

describe("formatNumber", () => {
  it("formats small numbers without separator", () => {
    expect(formatNumber(42)).toBe("42");
  });

  it("formats large numbers with locale separators", () => {
    const result = formatNumber(1234567);
    expect(result).toContain("1");
    expect(result).toContain("234");
    expect(result).toContain("567");
  });
});

describe("timeAgo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 'just now' for less than 60 seconds", () => {
    expect(timeAgo("2026-02-15T11:59:30Z")).toBe("just now");
  });

  it("returns minutes ago", () => {
    expect(timeAgo("2026-02-15T11:55:00Z")).toBe("5m ago");
  });

  it("returns hours ago", () => {
    expect(timeAgo("2026-02-15T09:00:00Z")).toBe("3h ago");
  });

  it("returns days ago", () => {
    expect(timeAgo("2026-02-13T12:00:00Z")).toBe("2d ago");
  });

  it("returns formatted date for old dates", () => {
    const result = timeAgo("2025-06-15T12:00:00Z");
    expect(result).toContain("2025");
  });

  it("accepts Date objects", () => {
    expect(timeAgo(new Date("2026-02-15T11:58:00Z"))).toBe("2m ago");
  });
});
