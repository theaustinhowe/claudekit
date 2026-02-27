import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { expandTilde } from "./utils";

describe("expandTilde", () => {
  const originalHome = process.env.HOME;

  beforeEach(() => {
    process.env.HOME = "/Users/testuser";
  });

  afterEach(() => {
    process.env.HOME = originalHome;
  });

  it("expands ~/path to HOME/path", () => {
    expect(expandTilde("~/projects")).toBe("/Users/testuser/projects");
  });

  it("expands lone ~ to HOME", () => {
    expect(expandTilde("~")).toBe("/Users/testuser");
  });

  it("leaves absolute paths unchanged", () => {
    expect(expandTilde("/absolute/path")).toBe("/absolute/path");
  });

  it("leaves relative paths unchanged", () => {
    expect(expandTilde("relative/path")).toBe("relative/path");
  });

  it("handles missing HOME env var", () => {
    delete process.env.HOME;
    expect(expandTilde("~/projects")).toBe("/projects");
  });

  it("expands nested tilde paths", () => {
    expect(expandTilde("~/a/b/c")).toBe("/Users/testuser/a/b/c");
  });
});
