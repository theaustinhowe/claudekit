import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  renameSync: vi.fn(),
}));

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { readMaturityOverrides, writeMaturityOverrides } from "./maturity";

const mockExistsSync = vi.mocked(existsSync);
const mockMkdirSync = vi.mocked(mkdirSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);
const mockRenameSync = vi.mocked(renameSync);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("readMaturityOverrides", () => {
  it("returns empty object when file does not exist", () => {
    mockExistsSync.mockReturnValue(false);

    const result = readMaturityOverrides();

    expect(result).toEqual({});
  });

  it("returns parsed overrides when file exists", () => {
    const overrides = { gadget: 75, inspector: 50 };
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(overrides));

    const result = readMaturityOverrides();

    expect(result).toEqual(overrides);
  });

  it("returns empty object for corrupt JSON", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("not valid json");

    const result = readMaturityOverrides();

    expect(result).toEqual({});
  });

  it("returns empty object when file contains an array", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify([1, 2, 3]));

    const result = readMaturityOverrides();

    expect(result).toEqual({});
  });

  it("returns empty object when file contains null", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(null));

    const result = readMaturityOverrides();

    expect(result).toEqual({});
  });
});

describe("writeMaturityOverrides", () => {
  it("writes data atomically via temp file and rename", () => {
    // ensureDir: directory exists
    mockExistsSync.mockReturnValue(true);

    const data = { gadget: 80 };
    writeMaturityOverrides(data);

    expect(mockWriteFileSync).toHaveBeenCalledWith(expect.stringContaining(".tmp."), JSON.stringify(data, null, 2));
    expect(mockRenameSync).toHaveBeenCalledWith(
      expect.stringContaining(".tmp."),
      expect.stringContaining("maturity.json"),
    );
  });

  it("creates directory if it does not exist", () => {
    mockExistsSync.mockReturnValue(false);

    writeMaturityOverrides({ gadget: 50 });

    expect(mockMkdirSync).toHaveBeenCalledWith(expect.stringContaining(".claudekit"), { recursive: true });
  });

  it("does not create directory if it already exists", () => {
    mockExistsSync.mockReturnValue(true);

    writeMaturityOverrides({ gadget: 50 });

    expect(mockMkdirSync).not.toHaveBeenCalled();
  });
});
