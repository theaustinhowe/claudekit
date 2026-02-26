import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  renameSync: vi.fn(),
}));

vi.mock("@/lib/constants/tools", () => ({
  DEFAULT_TOOL_IDS: ["node", "pnpm", "git"],
}));

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { readToolboxSettings, writeToolboxSettings } from "./toolbox-settings";

const mockExistsSync = vi.mocked(existsSync);
const mockMkdirSync = vi.mocked(mkdirSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);
const mockRenameSync = vi.mocked(renameSync);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("readToolboxSettings", () => {
  it("returns defaults when file does not exist", () => {
    mockExistsSync.mockReturnValue(false);

    const result = readToolboxSettings();

    expect(result).toEqual(["node", "pnpm", "git"]);
  });

  it("returns parsed tool IDs when file exists", () => {
    const ids = ["node", "bun", "claude"];
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(ids));

    const result = readToolboxSettings();

    expect(result).toEqual(ids);
  });

  it("returns defaults for corrupt JSON", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("not valid json");

    const result = readToolboxSettings();

    expect(result).toEqual(["node", "pnpm", "git"]);
  });

  it("returns defaults for empty array", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify([]));

    const result = readToolboxSettings();

    expect(result).toEqual(["node", "pnpm", "git"]);
  });
});

describe("writeToolboxSettings", () => {
  it("writes data atomically via temp file and rename", () => {
    mockExistsSync.mockReturnValue(true);

    const ids = ["node", "bun"];
    writeToolboxSettings(ids);

    expect(mockWriteFileSync).toHaveBeenCalledWith(expect.stringContaining(".tmp."), JSON.stringify(ids, null, 2));
    expect(mockRenameSync).toHaveBeenCalledWith(
      expect.stringContaining(".tmp."),
      expect.stringContaining("toolbox-settings.json"),
    );
  });

  it("creates directory if it does not exist", () => {
    mockExistsSync.mockReturnValue(false);

    writeToolboxSettings(["node"]);

    expect(mockMkdirSync).toHaveBeenCalledWith(expect.stringContaining(".claudekit"), { recursive: true });
  });

  it("does not create directory if it already exists", () => {
    mockExistsSync.mockReturnValue(true);

    writeToolboxSettings(["node"]);

    expect(mockMkdirSync).not.toHaveBeenCalled();
  });
});
