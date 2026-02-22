import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
  spawn: vi.fn(),
}));

import { execFileSync } from "node:child_process";
import { safeGitCommit, sanitizeGitRef, shellEscape } from "./git-utils";

const mockExecFileSync = vi.mocked(execFileSync);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("sanitizeGitRef", () => {
  it("accepts valid branch names", () => {
    expect(sanitizeGitRef("main")).toBe("main");
    expect(sanitizeGitRef("feature/foo")).toBe("feature/foo");
    expect(sanitizeGitRef("v1.0.0")).toBe("v1.0.0");
    expect(sanitizeGitRef("my-branch")).toBe("my-branch");
    expect(sanitizeGitRef("release_1.0")).toBe("release_1.0");
  });

  it("rejects refs with shell injection characters", () => {
    expect(() => sanitizeGitRef("; rm -rf /")).toThrow("Invalid git ref");
    expect(() => sanitizeGitRef("branch`cmd`")).toThrow("Invalid git ref");
    expect(() => sanitizeGitRef("branch name")).toThrow("Invalid git ref");
    expect(() => sanitizeGitRef("branch$(cmd)")).toThrow("Invalid git ref");
    expect(() => sanitizeGitRef("branch|pipe")).toThrow("Invalid git ref");
    expect(() => sanitizeGitRef("branch&bg")).toThrow("Invalid git ref");
  });

  it("rejects empty string", () => {
    expect(() => sanitizeGitRef("")).toThrow("Invalid git ref");
  });
});

describe("shellEscape", () => {
  it("wraps simple strings in single quotes", () => {
    expect(shellEscape("hello")).toBe("'hello'");
  });

  it("escapes single quotes within the string", () => {
    expect(shellEscape("it's")).toBe("'it'\\''s'");
  });

  it("handles empty strings", () => {
    expect(shellEscape("")).toBe("''");
  });

  it("handles strings with multiple single quotes", () => {
    expect(shellEscape("it's a 'test'")).toBe("'it'\\''s a '\\''test'\\'''");
  });
});

describe("safeGitCommit", () => {
  it("returns committed: true on success", () => {
    mockExecFileSync.mockReturnValue(Buffer.from(""));

    const result = safeGitCommit("/tmp/repo", "fix: something");

    expect(result).toEqual({ committed: true });
    expect(mockExecFileSync).toHaveBeenCalledWith("git", ["add", "-A"], { cwd: "/tmp/repo", stdio: "pipe" });
    expect(mockExecFileSync).toHaveBeenCalledWith("git", ["commit", "-m", "fix: something"], {
      cwd: "/tmp/repo",
      stdio: "pipe",
    });
  });

  it("handles 'nothing to commit' gracefully", () => {
    mockExecFileSync
      .mockReturnValueOnce(Buffer.from("")) // git add
      .mockImplementationOnce(() => {
        const err = new Error("git commit failed") as Error & { stderr: Buffer };
        err.stderr = Buffer.from("nothing to commit, working tree clean");
        throw err;
      });

    const result = safeGitCommit("/tmp/repo", "fix: something");
    expect(result).toEqual({ committed: false });
    expect(result.error).toBeUndefined();
  });

  it("handles 'nothing added to commit' gracefully", () => {
    mockExecFileSync
      .mockReturnValueOnce(Buffer.from(""))
      .mockImplementationOnce(() => {
        const err = new Error("git commit failed") as Error & { stderr: Buffer };
        err.stderr = Buffer.from("nothing added to commit");
        throw err;
      });

    const result = safeGitCommit("/tmp/repo", "fix: something");
    expect(result).toEqual({ committed: false });
  });

  it("returns error on other failures", () => {
    mockExecFileSync
      .mockReturnValueOnce(Buffer.from(""))
      .mockImplementationOnce(() => {
        const err = new Error("git commit failed") as Error & { stderr: Buffer };
        err.stderr = Buffer.from("fatal: not a git repository");
        throw err;
      });

    const result = safeGitCommit("/tmp/repo", "fix: something");
    expect(result.committed).toBe(false);
    expect(result.error).toContain("fatal: not a git repository");
  });

  it("truncates long error messages to 200 chars", () => {
    mockExecFileSync
      .mockReturnValueOnce(Buffer.from(""))
      .mockImplementationOnce(() => {
        const err = new Error("fail") as Error & { stderr: Buffer };
        err.stderr = Buffer.from("x".repeat(300));
        throw err;
      });

    const result = safeGitCommit("/tmp/repo", "fix: something");
    expect(result.error).toHaveLength(200);
  });
});
