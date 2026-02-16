import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => ({
  default: {
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  },
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

import fs from "node:fs";
import { readClaudeMd, readSettingsJson, writeClaudeMd, writeSettingsJson } from "./claude-config";

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
});
