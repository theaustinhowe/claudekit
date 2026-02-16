import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}));
vi.mock("node:fs", () => ({
  default: {
    readFileSync: vi.fn(),
    existsSync: vi.fn(),
    readdirSync: vi.fn(),
  },
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  getDb: vi.fn(async () => ({})),
  execute: vi.fn(),
  queryAll: vi.fn(),
}));
vi.mock("@/lib/utils", () => ({
  generateId: vi.fn(() => "test-id"),
}));

import fs from "node:fs";
import { discoverConcepts, parseFrontmatter, tryReadFile, tryReadJson } from "./concept-scanner";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("concept-scanner", () => {
  describe("parseFrontmatter", () => {
    it("parses frontmatter between --- delimiters", () => {
      const content = `---
name: My Skill
description: Does things
---
Body content here`;

      const result = parseFrontmatter(content);

      expect(result.frontmatter).toEqual({ name: "My Skill", description: "Does things" });
      expect(result.body).toBe("Body content here");
    });

    it("returns empty frontmatter when no delimiters", () => {
      const result = parseFrontmatter("Just body text");

      expect(result.frontmatter).toEqual({});
      expect(result.body).toBe("Just body text");
    });

    it("returns empty frontmatter when only opening delimiter", () => {
      const result = parseFrontmatter("---\nname: test\nno closing");

      expect(result.frontmatter).toEqual({});
      expect(result.body).toBe("---\nname: test\nno closing");
    });

    it("handles leading whitespace", () => {
      const content = `  ---
key: value
---
body`;

      const result = parseFrontmatter(content);
      expect(result.frontmatter).toEqual({ key: "value" });
    });

    it("handles values with colons", () => {
      const content = `---
url: https://example.com
---
body`;

      const result = parseFrontmatter(content);
      expect(result.frontmatter).toEqual({ url: "https://example.com" });
    });
  });

  describe("tryReadFile", () => {
    it("reads file content", () => {
      vi.mocked(fs.readFileSync).mockReturnValue("file content");

      expect(tryReadFile("/path/to/file")).toBe("file content");
    });

    it("returns null on error", () => {
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error("ENOENT");
      });

      expect(tryReadFile("/missing")).toBeNull();
    });
  });

  describe("tryReadJson", () => {
    it("reads and parses JSON", () => {
      vi.mocked(fs.readFileSync).mockReturnValue('{"key":"value"}');

      expect(tryReadJson("/file.json")).toEqual({ key: "value" });
    });

    it("returns null for invalid JSON", () => {
      vi.mocked(fs.readFileSync).mockReturnValue("not json");

      expect(tryReadJson("/file.json")).toBeNull();
    });

    it("returns null for missing file", () => {
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error("ENOENT");
      });

      expect(tryReadJson("/missing.json")).toBeNull();
    });
  });

  describe("discoverConcepts", () => {
    it("discovers MCP servers from .mcp.json", () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => String(p).endsWith(".mcp.json"));
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          mcpServers: {
            filesystem: { command: "npx", args: ["-y", "@mcp/server-filesystem"] },
          },
        }),
      );

      const results = discoverConcepts("/repo");
      const mcpConcepts = results.filter((c) => c.concept_type === "mcp_server");

      expect(mcpConcepts).toHaveLength(1);
      expect(mcpConcepts[0].name).toBe("filesystem");
    });

    it("discovers hooks from settings files", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        if (String(p).includes("settings")) {
          return JSON.stringify({ hooks: { PreCommit: { command: "lint" } } });
        }
        throw new Error("ENOENT");
      });

      const results = discoverConcepts("/repo");
      const hookConcepts = results.filter((c) => c.concept_type === "hook");

      expect(hookConcepts).toHaveLength(2); // settings.json and settings.local.json
      expect(hookConcepts[0].name).toBe("PreCommit");
    });

    it("returns empty array for bare repo", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error("ENOENT");
      });

      const results = discoverConcepts("/empty-repo");

      expect(results).toEqual([]);
    });
  });
});
