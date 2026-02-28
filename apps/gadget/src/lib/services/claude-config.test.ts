import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => ({
  default: {
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    readdirSync: vi.fn(),
    unlinkSync: vi.fn(),
  },
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

import fs from "node:fs";
import {
  deleteRuleFile,
  readClaudeMd,
  readRulesFiles,
  readSettingsJson,
  readSharedSettingsJson,
  writeClaudeMd,
  writeRuleFile,
  writeSettingsJson,
  writeSharedSettingsJson,
} from "./claude-config";

type ReaddirDirent = Extract<ReturnType<typeof fs.readdirSync>, fs.Dirent[]>[number];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("claude-config", () => {
  describe("readSettingsJson", () => {
    it("reads and parses JSON settings", async () => {
      const data = { allowedTools: ["Write"] };
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(data));

      const result = await readSettingsJson("/repo");

      expect(result).toEqual({ content: JSON.stringify(data), parsed: data });
      expect(fs.readFileSync).toHaveBeenCalledWith("/repo/.claude/settings.local.json", "utf-8");
    });

    it("returns null when file does not exist", async () => {
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error("ENOENT");
      });

      const result = await readSettingsJson("/repo");

      expect(result).toBeNull();
    });
  });

  describe("writeSettingsJson", () => {
    it("writes settings and creates directory", async () => {
      await writeSettingsJson("/repo", '{"key":"value"}');

      expect(fs.mkdirSync).toHaveBeenCalledWith("/repo/.claude", { recursive: true });
      expect(fs.writeFileSync).toHaveBeenCalledWith("/repo/.claude/settings.local.json", '{"key":"value"}', "utf-8");
    });
  });

  describe("readClaudeMd", () => {
    it("reads CLAUDE.md content", async () => {
      vi.mocked(fs.readFileSync).mockReturnValue("# Claude Config");

      const result = await readClaudeMd("/repo");

      expect(result).toBe("# Claude Config");
      expect(fs.readFileSync).toHaveBeenCalledWith("/repo/CLAUDE.md", "utf-8");
    });

    it("returns null when file does not exist", async () => {
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error("ENOENT");
      });

      const result = await readClaudeMd("/repo");

      expect(result).toBeNull();
    });
  });

  describe("writeClaudeMd", () => {
    it("writes CLAUDE.md content", async () => {
      await writeClaudeMd("/repo", "# New content");

      expect(fs.writeFileSync).toHaveBeenCalledWith("/repo/CLAUDE.md", "# New content", "utf-8");
    });
  });

  describe("readSharedSettingsJson", () => {
    it("reads and parses shared settings JSON", async () => {
      const data = { permissions: { allow: ["Read"] } };
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(data));

      const result = await readSharedSettingsJson("/repo");

      expect(result).toEqual({ content: JSON.stringify(data), parsed: data });
      expect(fs.readFileSync).toHaveBeenCalledWith("/repo/.claude/settings.json", "utf-8");
    });

    it("returns null when file does not exist", async () => {
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error("ENOENT");
      });

      const result = await readSharedSettingsJson("/repo");

      expect(result).toBeNull();
    });
  });

  describe("writeSharedSettingsJson", () => {
    it("writes shared settings and creates directory", async () => {
      await writeSharedSettingsJson("/repo", '{"permissions":{}}');

      expect(fs.mkdirSync).toHaveBeenCalledWith("/repo/.claude", { recursive: true });
      expect(fs.writeFileSync).toHaveBeenCalledWith("/repo/.claude/settings.json", '{"permissions":{}}', "utf-8");
    });
  });

  describe("readRulesFiles", () => {
    it("reads .md files sorted from rules directory", async () => {
      vi.mocked(fs.readdirSync).mockReturnValue(["b-rule.md", "a-rule.md", "not-md.txt"] as string[] & ReaddirDirent[]);
      vi.mocked(fs.readFileSync).mockReturnValueOnce("Rule A content").mockReturnValueOnce("Rule B content");

      const result = await readRulesFiles("/repo");

      expect(result).toEqual([
        { name: "a-rule.md", content: "Rule A content" },
        { name: "b-rule.md", content: "Rule B content" },
      ]);
    });

    it("returns empty array on error", async () => {
      vi.mocked(fs.readdirSync).mockImplementation(() => {
        throw new Error("ENOENT");
      });

      const result = await readRulesFiles("/repo");

      expect(result).toEqual([]);
    });
  });

  describe("writeRuleFile", () => {
    it("appends .md extension when missing", async () => {
      await writeRuleFile("/repo", "my-rule", "Rule content");

      expect(fs.mkdirSync).toHaveBeenCalledWith("/repo/.claude/rules", { recursive: true });
      expect(fs.writeFileSync).toHaveBeenCalledWith("/repo/.claude/rules/my-rule.md", "Rule content", "utf-8");
    });

    it("sanitizes dots in name so .md gets stripped and re-appended", async () => {
      // The regex strips `.` so "my-rule.md" → "my-rulemd" → "my-rulemd.md"
      await writeRuleFile("/repo", "my-rule.md", "Rule content");

      expect(fs.writeFileSync).toHaveBeenCalledWith("/repo/.claude/rules/my-rulemd.md", "Rule content", "utf-8");
    });

    it("sanitizes filename to remove special characters", async () => {
      await writeRuleFile("/repo", "my rule!@#$%", "content");

      expect(fs.writeFileSync).toHaveBeenCalledWith("/repo/.claude/rules/myrule.md", "content", "utf-8");
    });
  });

  describe("deleteRuleFile", () => {
    it("deletes the rule file", async () => {
      await deleteRuleFile("/repo", "my-rule.md");

      expect(fs.unlinkSync).toHaveBeenCalledWith("/repo/.claude/rules/my-rule.md");
    });

    it("does not throw when file does not exist", async () => {
      vi.mocked(fs.unlinkSync).mockImplementation(() => {
        throw new Error("ENOENT");
      });

      await expect(deleteRuleFile("/repo", "missing.md")).resolves.toBeUndefined();
    });
  });
});
