import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  getDb: vi.fn(() => ({})),
  queryOne: vi.fn(),
}));

import { readFile, writeFile } from "node:fs/promises";
import { queryOne } from "@/lib/db";
import { getConfiguredEnvKeyNames, hasGitHubPat, readEnvLocal, writeEnvKey } from "./env-keys";

const mockReadFile = vi.mocked(readFile);
const mockWriteFile = vi.mocked(writeFile);
const mockQueryOne = vi.mocked(queryOne);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("readEnvLocal", () => {
  it("parses key-value pairs from .env.local", async () => {
    mockReadFile.mockResolvedValue("KEY1=value1\nKEY2=value2\n# COMMENT=ignored\n\nKEY3=value3");

    const result = await readEnvLocal();
    expect(result).toEqual({ KEY1: "value1", KEY2: "value2", KEY3: "value3" });
  });

  it("returns empty object when file does not exist", async () => {
    mockReadFile.mockRejectedValue(new Error("ENOENT"));

    const result = await readEnvLocal();
    expect(result).toEqual({});
  });

  it("ignores lines without equals sign", async () => {
    mockReadFile.mockResolvedValue("VALID=yes\ninvalid_line\n");

    const result = await readEnvLocal();
    expect(result).toEqual({ VALID: "yes" });
  });

  it("handles values with equals signs", async () => {
    mockReadFile.mockResolvedValue("KEY=value=with=equals");

    const result = await readEnvLocal();
    expect(result).toEqual({ KEY: "value=with=equals" });
  });
});

describe("writeEnvKey", () => {
  it("updates an existing key", async () => {
    mockReadFile.mockResolvedValue("KEY1=old_value\nKEY2=keep");
    mockWriteFile.mockResolvedValue(undefined);

    const result = await writeEnvKey("KEY1", "new_value");
    expect(result).toEqual({ success: true, message: "KEY1 saved" });
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining(".env.local"),
      expect.stringContaining("KEY1=new_value"),
      "utf-8",
    );
  });

  it("comments out key when value is empty", async () => {
    mockReadFile.mockResolvedValue("KEY1=old_value\n");
    mockWriteFile.mockResolvedValue(undefined);

    const result = await writeEnvKey("KEY1", "");
    expect(result).toEqual({ success: true, message: "KEY1 cleared" });
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining(".env.local"),
      expect.stringContaining("# KEY1="),
      "utf-8",
    );
  });

  it("appends new key when not found", async () => {
    mockReadFile.mockResolvedValue("EXISTING=yes\n");
    mockWriteFile.mockResolvedValue(undefined);

    const result = await writeEnvKey("NEW_KEY", "new_value");
    expect(result).toEqual({ success: true, message: "NEW_KEY saved" });
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining(".env.local"),
      expect.stringContaining("NEW_KEY=new_value"),
      "utf-8",
    );
  });

  it("creates file when it does not exist", async () => {
    mockReadFile.mockRejectedValue(new Error("ENOENT"));
    mockWriteFile.mockResolvedValue(undefined);

    const result = await writeEnvKey("KEY1", "value1");
    expect(result).toEqual({ success: true, message: "KEY1 saved" });
  });

  it("returns error on write failure", async () => {
    mockReadFile.mockResolvedValue("");
    mockWriteFile.mockRejectedValue(new Error("Permission denied"));

    const result = await writeEnvKey("KEY1", "value1");
    expect(result).toEqual({ success: false, message: "Permission denied" });
  });
});

describe("getConfiguredEnvKeyNames", () => {
  it("returns non-empty key names", async () => {
    mockReadFile.mockResolvedValue("KEY1=value1\nKEY2=\nKEY3=value3");

    const result = await getConfiguredEnvKeyNames();
    expect(result).toEqual(["KEY1", "KEY3"]);
  });
});

describe("hasGitHubPat", () => {
  it("returns true when PAT in env", async () => {
    mockReadFile.mockResolvedValue("GITHUB_PERSONAL_ACCESS_TOKEN=ghp_abc123");

    const result = await hasGitHubPat();
    expect(result).toBe(true);
  });

  it("falls back to DB when no env PAT", async () => {
    mockReadFile.mockResolvedValue("");
    mockQueryOne.mockResolvedValue({ cnt: 1 });

    const result = await hasGitHubPat();
    expect(result).toBe(true);
  });

  it("returns false when no PAT anywhere", async () => {
    mockReadFile.mockResolvedValue("");
    mockQueryOne.mockResolvedValue({ cnt: 0 });

    const result = await hasGitHubPat();
    expect(result).toBe(false);
  });

  it("returns false on DB error", async () => {
    mockReadFile.mockResolvedValue("");
    mockQueryOne.mockRejectedValue(new Error("DB error"));

    const result = await hasGitHubPat();
    expect(result).toBe(false);
  });
});
