import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
  spawn: vi.fn(),
}));
vi.mock("node:fs", () => ({
  default: { writeFileSync: vi.fn(), unlinkSync: vi.fn() },
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
}));
vi.mock("node:os", () => ({
  default: { tmpdir: () => "/tmp" },
  tmpdir: () => "/tmp",
}));

import { execFileSync } from "node:child_process";
import { safeGitCommit, sanitizeGitRef, shellEscape } from "./git-utils";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("git-utils", () => {
  describe("sanitizeGitRef", () => {
    it("allows valid refs", () => {
      expect(sanitizeGitRef("main")).toBe("main");
      expect(sanitizeGitRef("feature/foo-bar")).toBe("feature/foo-bar");
      expect(sanitizeGitRef("v1.2.3")).toBe("v1.2.3");
    });

    it("throws on invalid refs", () => {
      expect(() => sanitizeGitRef("branch name")).toThrow("Invalid git ref");
      expect(() => sanitizeGitRef("foo;rm -rf")).toThrow("Invalid git ref");
      expect(() => sanitizeGitRef("foo`whoami`")).toThrow("Invalid git ref");
    });
  });

  describe("shellEscape", () => {
    it("wraps in single quotes", () => {
      expect(shellEscape("hello")).toBe("'hello'");
    });

    it("escapes single quotes inside", () => {
      expect(shellEscape("it's")).toBe("'it'\\''s'");
    });
  });

  describe("safeGitCommit", () => {
    it("returns committed true on success", () => {
      vi.mocked(execFileSync).mockReturnValue(Buffer.from(""));

      const result = safeGitCommit("/repo", "test commit");

      expect(result).toEqual({ committed: true });
      expect(execFileSync).toHaveBeenCalledWith("git", ["add", "-A"], expect.objectContaining({ cwd: "/repo" }));
      expect(execFileSync).toHaveBeenCalledWith(
        "git",
        ["commit", "-m", "test commit"],
        expect.objectContaining({ cwd: "/repo" }),
      );
    });

    it("returns committed false when nothing to commit", () => {
      vi.mocked(execFileSync)
        .mockReturnValueOnce(Buffer.from(""))
        .mockImplementationOnce(() => {
          const err = new Error("nothing to commit") as Error & { stderr: Buffer };
          err.stderr = Buffer.from("nothing to commit");
          throw err;
        });

      const result = safeGitCommit("/repo", "test");

      expect(result).toEqual({ committed: false });
    });

    it("returns error on unexpected failure", () => {
      vi.mocked(execFileSync)
        .mockReturnValueOnce(Buffer.from(""))
        .mockImplementationOnce(() => {
          const err = new Error("fatal error") as Error & { stderr: Buffer };
          err.stderr = Buffer.from("fatal error");
          throw err;
        });

      const result = safeGitCommit("/repo", "test");

      expect(result).toEqual({ committed: false, error: "fatal error" });
    });
  });
});
