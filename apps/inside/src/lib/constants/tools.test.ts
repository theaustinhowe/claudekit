import { describe, expect, it } from "vitest";
import { DEFAULT_TOOLS } from "./tools";

describe("DEFAULT_TOOLS", () => {
  it("is an array of tool definitions", () => {
    expect(Array.isArray(DEFAULT_TOOLS)).toBe(true);
    expect(DEFAULT_TOOLS.length).toBeGreaterThan(0);
  });

  it("has at least 13 tools", () => {
    expect(DEFAULT_TOOLS.length).toBeGreaterThanOrEqual(13);
  });

  it("each tool has required fields", () => {
    for (const tool of DEFAULT_TOOLS) {
      expect(tool.id).toBeTruthy();
      expect(tool.name).toBeTruthy();
      expect(tool.category).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.binary).toBeTruthy();
      expect(tool.versionCommand).toBeTruthy();
      expect(tool.versionParser).toBeTruthy();
      expect(tool.installUrl).toBeTruthy();
    }
  });

  it("versionParser is one of the allowed values", () => {
    const allowed = ["semver-line", "first-line", "regex"];
    for (const tool of DEFAULT_TOOLS) {
      expect(allowed).toContain(tool.versionParser);
    }
  });

  it("category is one of the allowed values", () => {
    const allowed = ["package-manager", "runtime", "dev-tool", "vcs", "ai-tool"];
    for (const tool of DEFAULT_TOOLS) {
      expect(allowed).toContain(tool.category);
    }
  });

  it("includes essential tools", () => {
    const ids = DEFAULT_TOOLS.map((t) => t.id);
    expect(ids).toContain("node");
    expect(ids).toContain("git");
    expect(ids).toContain("pnpm");
    expect(ids).toContain("npm");
    expect(ids).toContain("claude");
    expect(ids).toContain("docker");
  });

  it("nvm has shellFunction set to true", () => {
    const nvm = DEFAULT_TOOLS.find((t) => t.id === "nvm");
    expect(nvm).toBeDefined();
    expect(nvm?.shellFunction).toBe(true);
  });

  it("tools with regex parser have versionRegex", () => {
    const regexTools = DEFAULT_TOOLS.filter((t) => t.versionParser === "regex");
    for (const tool of regexTools) {
      expect(tool.versionRegex).toBeTruthy();
    }
  });

  it("each tool has a latestVersionSource", () => {
    for (const tool of DEFAULT_TOOLS) {
      expect(tool.latestVersionSource).toBeDefined();
    }
  });

  it("latestVersionSource types are valid", () => {
    const validTypes = ["npm", "github-release", "url", "none"];
    for (const tool of DEFAULT_TOOLS) {
      if (tool.latestVersionSource) {
        expect(validTypes).toContain(tool.latestVersionSource.type);
      }
    }
  });
});
