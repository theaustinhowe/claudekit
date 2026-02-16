import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(() => ({})),
  queryOne: vi.fn(),
}));
vi.mock("@/lib/utils", () => ({
  expandTilde: vi.fn((p: string) => p.replace("~", "/home/user")),
}));
vi.mock("@/lib/actions/settings", () => ({
  getSetting: vi.fn(),
  setSetting: vi.fn(),
}));
vi.mock("@/lib/services/claude-config", () => ({
  readSettingsJson: vi.fn(),
  readClaudeMd: vi.fn(),
  writeSettingsJson: vi.fn(),
  writeClaudeMd: vi.fn(),
}));

import { getSetting, setSetting } from "@/lib/actions/settings";
import { queryOne } from "@/lib/db";
import { readClaudeMd, readSettingsJson, writeClaudeMd, writeSettingsJson } from "@/lib/services/claude-config";
import {
  getClaudeConfig,
  getDefaultClaudeSettings,
  saveClaudeMd,
  saveClaudeSettingsJson,
  saveDefaultClaudeSettings,
} from "./claude-config";

const mockQueryOne = vi.mocked(queryOne);
const mockReadSettingsJson = vi.mocked(readSettingsJson);
const mockReadClaudeMd = vi.mocked(readClaudeMd);
const mockWriteSettingsJson = vi.mocked(writeSettingsJson);
const mockWriteClaudeMd = vi.mocked(writeClaudeMd);
const mockGetSetting = vi.mocked(getSetting);
const mockSetSetting = vi.mocked(setSetting);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("getClaudeConfig", () => {
  it("returns config for a valid repo", async () => {
    mockQueryOne.mockResolvedValue({ local_path: "~/project" });
    mockReadSettingsJson.mockResolvedValue({ content: '{"key":"val"}' });
    mockReadClaudeMd.mockResolvedValue("# CLAUDE.md content");

    const result = await getClaudeConfig("repo-1");
    expect(result.settingsJson).toBe('{"key":"val"}');
    expect(result.claudeMd).toBe("# CLAUDE.md content");
    expect(result.repoPath).toBe("/home/user/project");
  });

  it("returns nulls when repo not found", async () => {
    mockQueryOne.mockResolvedValue(undefined);

    const result = await getClaudeConfig("nonexistent");
    expect(result.settingsJson).toBeNull();
    expect(result.claudeMd).toBeNull();
    expect(result.repoPath).toBe("");
  });

  it("handles null settings", async () => {
    mockQueryOne.mockResolvedValue({ local_path: "/project" });
    mockReadSettingsJson.mockResolvedValue(null);
    mockReadClaudeMd.mockResolvedValue(null);

    const result = await getClaudeConfig("repo-1");
    expect(result.settingsJson).toBeNull();
    expect(result.claudeMd).toBeNull();
  });
});

describe("saveClaudeSettingsJson", () => {
  it("saves valid JSON settings", async () => {
    mockQueryOne.mockResolvedValue({ local_path: "~/project" });
    mockWriteSettingsJson.mockResolvedValue(undefined);

    await saveClaudeSettingsJson("repo-1", '{"allowedTools":["Write"]}');
    expect(mockWriteSettingsJson).toHaveBeenCalledWith("/home/user/project", '{"allowedTools":["Write"]}');
  });

  it("throws when repo not found", async () => {
    mockQueryOne.mockResolvedValue(undefined);

    await expect(saveClaudeSettingsJson("nonexistent", "{}")).rejects.toThrow("Repository not found");
  });

  it("throws for invalid JSON", async () => {
    mockQueryOne.mockResolvedValue({ local_path: "/project" });

    await expect(saveClaudeSettingsJson("repo-1", "not json")).rejects.toThrow();
  });
});

describe("saveClaudeMd", () => {
  it("saves CLAUDE.md content", async () => {
    mockQueryOne.mockResolvedValue({ local_path: "~/project" });
    mockWriteClaudeMd.mockResolvedValue(undefined);

    await saveClaudeMd("repo-1", "# My CLAUDE.md");
    expect(mockWriteClaudeMd).toHaveBeenCalledWith("/home/user/project", "# My CLAUDE.md");
  });

  it("throws when repo not found", async () => {
    mockQueryOne.mockResolvedValue(undefined);

    await expect(saveClaudeMd("nonexistent", "content")).rejects.toThrow("Repository not found");
  });
});

describe("saveDefaultClaudeSettings", () => {
  it("saves valid JSON to settings", async () => {
    mockSetSetting.mockResolvedValue(undefined);

    await saveDefaultClaudeSettings('{"allowedTools":[]}');
    expect(mockSetSetting).toHaveBeenCalledWith("claude_settings_default", '{"allowedTools":[]}');
  });

  it("throws for invalid JSON", async () => {
    await expect(saveDefaultClaudeSettings("not json")).rejects.toThrow();
  });
});

describe("getDefaultClaudeSettings", () => {
  it("returns saved settings", async () => {
    mockGetSetting.mockResolvedValue('{"key":"val"}');

    const result = await getDefaultClaudeSettings();
    expect(result).toBe('{"key":"val"}');
  });

  it("returns null when not set", async () => {
    mockGetSetting.mockResolvedValue(null);

    const result = await getDefaultClaudeSettings();
    expect(result).toBeNull();
  });
});
