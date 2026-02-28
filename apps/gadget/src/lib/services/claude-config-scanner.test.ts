import { cast } from "@claudekit/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
vi.mock("node:os", () => ({
  default: { homedir: () => "/home/testuser" },
  homedir: () => "/home/testuser",
}));

import fs from "node:fs";
import { discoverClaudeConfigConcepts } from "./claude-config-scanner";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("claude-config-scanner", () => {
  describe("discoverClaudeConfigConcepts", () => {
    it("returns empty array when .claude dir does not exist", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = discoverClaudeConfigConcepts();

      expect(result).toEqual([]);
    });

    it("discovers global hooks", () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        if (String(p) === "/home/testuser/.claude") return true;
        return false;
      });
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        if (String(p).endsWith("settings.json")) {
          return JSON.stringify({ hooks: { PreCommit: { command: "lint" } } });
        }
        throw new Error("ENOENT");
      });

      const result = discoverClaudeConfigConcepts();
      const hooks = result.filter((c) => c.concept_type === "hook");

      expect(hooks).toHaveLength(1);
      expect(hooks[0].name).toBe("PreCommit");
      expect(hooks[0].metadata.scope).toBe("global");
    });

    it("discovers global plugins from enabledPlugins", () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        if (String(p) === "/home/testuser/.claude") return true;
        return false;
      });
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        if (String(p).endsWith("settings.json")) {
          return JSON.stringify({ enabledPlugins: ["my-plugin"] });
        }
        throw new Error("ENOENT");
      });

      const result = discoverClaudeConfigConcepts();
      const plugins = result.filter((c) => c.concept_type === "plugin");

      expect(plugins).toHaveLength(1);
      expect(plugins[0].name).toBe("my-plugin");
    });

    it("discovers global commands from commands directory", () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const s = String(p);
        if (s === "/home/testuser/.claude") return true;
        if (s === "/home/testuser/.claude/commands") return true;
        return false;
      });
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        if (String(p).endsWith("settings.json") || String(p).endsWith("settings.local.json")) {
          throw new Error("ENOENT");
        }
        if (String(p).endsWith("test-cmd.md")) {
          return "---\nname: test-cmd\ndescription: A test command\n---\nDo something";
        }
        throw new Error("ENOENT");
      });
      vi.mocked(fs.readdirSync).mockImplementation((p) => {
        if (String(p).endsWith("commands")) {
          return cast([{ name: "test-cmd.md", isFile: () => true, isDirectory: () => false }]);
        }
        return [];
      });

      const result = discoverClaudeConfigConcepts();
      const commands = result.filter((c) => c.concept_type === "command");

      expect(commands).toHaveLength(1);
      expect(commands[0].name).toBe("test-cmd");
    });
  });
});
