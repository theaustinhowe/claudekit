import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(true),
    readdirSync: vi.fn().mockReturnValue([]),
    statSync: vi.fn().mockReturnValue({ isDirectory: () => false, size: 100 }),
    readFileSync: vi.fn().mockReturnValue("file content"),
    openSync: vi.fn().mockReturnValue(1),
    readSync: vi.fn(),
    closeSync: vi.fn(),
  },
  existsSync: vi.fn().mockReturnValue(true),
  readdirSync: vi.fn().mockReturnValue([]),
  statSync: vi.fn().mockReturnValue({ isDirectory: () => false, size: 100 }),
  readFileSync: vi.fn().mockReturnValue("file content"),
  openSync: vi.fn().mockReturnValue(1),
  readSync: vi.fn(),
  closeSync: vi.fn(),
}));

vi.mock("@/lib/utils", () => ({
  expandTilde: vi.fn((p: string) => p.replace("~", "/Users/testuser")),
}));

vi.mock("@/lib/constants", () => ({
  IMAGE_EXTENSIONS: new Set([".png", ".jpg", ".jpeg", ".gif"]),
}));

vi.mock("@/lib/services/language-detector", () => ({
  detectLanguage: vi.fn().mockReturnValue("typescript"),
  isBinaryFile: vi.fn().mockReturnValue(false),
}));

import fs from "node:fs";
import { isBinaryFile } from "@/lib/services/language-detector";
import { getProjectFileContent, getProjectTree } from "./prototype-files";

function createMockDirent(name: string, isDir: boolean) {
  return { name, isDirectory: () => isDir, isFile: () => !isDir } as fs.Dirent<Buffer>;
}

const mockFs = vi.mocked(fs);
const mockIsBinaryFile = vi.mocked(isBinaryFile);

beforeEach(() => {
  vi.clearAllMocks();
  mockFs.existsSync.mockReturnValue(true);
  mockFs.statSync.mockReturnValue({ isDirectory: () => false, size: 100 } as ReturnType<typeof fs.statSync>);
  mockFs.readFileSync.mockReturnValue("file content");
  mockIsBinaryFile.mockReturnValue(false);
});

describe("getProjectTree", () => {
  it("returns entries for a directory", async () => {
    mockFs.readdirSync.mockReturnValue([
      createMockDirent("src", true),
      createMockDirent("README.md", false),
      createMockDirent("package.json", false),
    ]);

    const result = await getProjectTree("/tmp", "my-app");
    expect(result).toHaveLength(3);
    // Directories first, then files alphabetically
    expect(result[0].name).toBe("src");
    expect(result[0].type).toBe("directory");
    expect(result[1].name).toBe("package.json");
    expect(result[1].type).toBe("file");
  });

  it("filters out hidden files and node_modules", async () => {
    mockFs.readdirSync.mockReturnValue([
      createMockDirent(".git", true),
      createMockDirent("node_modules", true),
      createMockDirent("src", true),
    ]);

    const result = await getProjectTree("/tmp", "my-app");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("src");
  });

  it("returns empty when directory does not exist", async () => {
    mockFs.existsSync.mockReturnValue(false);
    const result = await getProjectTree("/tmp", "my-app");
    expect(result).toEqual([]);
  });

  it("supports subPath parameter", async () => {
    mockFs.readdirSync.mockReturnValue([createMockDirent("index.ts", false)]);

    const result = await getProjectTree("/tmp", "my-app", "src");
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe("src/index.ts");
  });

  it("rejects path traversal attempts", async () => {
    const result = await getProjectTree("/tmp", "my-app", "../../etc");
    expect(result).toEqual([]);
  });
});

describe("getProjectFileContent", () => {
  it("reads a text file", async () => {
    mockFs.statSync.mockReturnValue({ isDirectory: () => false, size: 100 } as ReturnType<typeof fs.statSync>);
    mockFs.readFileSync.mockReturnValue('console.log("hello")');

    const result = await getProjectFileContent("/tmp", "my-app", "src/index.ts");
    expect(result).not.toBeNull();
    expect(result?.content).toBe('console.log("hello")');
    expect(result?.language).toBe("typescript");
    expect(result?.isBinary).toBe(false);
  });

  it("returns null when file does not exist", async () => {
    mockFs.existsSync.mockReturnValue(false);
    const result = await getProjectFileContent("/tmp", "my-app", "nonexistent.ts");
    expect(result).toBeNull();
  });

  it("returns null for directories", async () => {
    mockFs.statSync.mockReturnValue({ isDirectory: () => true, size: 0 } as ReturnType<typeof fs.statSync>);
    const result = await getProjectFileContent("/tmp", "my-app", "src");
    expect(result).toBeNull();
  });

  it("handles binary files", async () => {
    mockIsBinaryFile.mockReturnValue(true);
    mockFs.statSync.mockReturnValue({ isDirectory: () => false, size: 5000 } as ReturnType<typeof fs.statSync>);

    const result = await getProjectFileContent("/tmp", "my-app", "image.png");
    expect(result).not.toBeNull();
    expect(result?.isBinary).toBe(true);
    expect(result?.content).toBe("");
  });

  it("rejects path traversal attempts", async () => {
    const result = await getProjectFileContent("/tmp", "my-app", "../../etc/passwd");
    expect(result).toBeNull();
  });

  it("truncates large files", async () => {
    mockFs.statSync.mockReturnValue({
      isDirectory: () => false,
      size: 2 * 1024 * 1024, // 2MB
    } as ReturnType<typeof fs.statSync>);
    mockFs.openSync.mockReturnValue(1);

    const result = await getProjectFileContent("/tmp", "my-app", "large-file.ts");
    expect(result).not.toBeNull();
    expect(mockFs.openSync).toHaveBeenCalled();
  });
});
