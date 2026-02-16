import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn(),
    readdirSync: vi.fn(),
    statSync: vi.fn(),
    readFileSync: vi.fn(),
    openSync: vi.fn(),
    readSync: vi.fn(),
    closeSync: vi.fn(),
  },
}));
vi.mock("@/lib/utils", () => ({
  expandTilde: vi.fn((p: string) => p.replace("~", "/home/user")),
}));
vi.mock("@/lib/constants", () => ({
  IMAGE_EXTENSIONS: new Set([".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"]),
}));
vi.mock("@/lib/services/language-detector", () => ({
  detectLanguage: vi.fn((filePath: string) => {
    if (filePath.endsWith(".ts")) return "typescript";
    if (filePath.endsWith(".js")) return "javascript";
    if (filePath.endsWith(".json")) return "json";
    return "plaintext";
  }),
  isBinaryFile: vi.fn((filePath: string) => {
    const ext = filePath.split(".").pop();
    return ["png", "jpg", "gif", "woff2"].includes(ext || "");
  }),
}));

import fs from "node:fs";
import { getProjectFileContent, getProjectTree } from "./prototype-files";

const mockExistsSync = vi.mocked(fs.existsSync);
const mockReaddirSync = vi.mocked(fs.readdirSync);
const mockStatSync = vi.mocked(fs.statSync);
const mockReadFileSync = vi.mocked(fs.readFileSync);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("getProjectTree", () => {
  it("returns directory entries sorted", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue([
      { name: "src", isDirectory: () => true, isFile: () => false },
      { name: "package.json", isDirectory: () => false, isFile: () => true },
      { name: ".git", isDirectory: () => true, isFile: () => false },
    ] as never);

    const result = await getProjectTree("/projects", "my-app");
    // .git should be filtered out (starts with .)
    expect(result).toHaveLength(2);
    // Directories come first
    expect(result[0]).toEqual({ name: "src", type: "directory", path: "src" });
    expect(result[1]).toEqual({ name: "package.json", type: "file", path: "package.json" });
  });

  it("returns empty array when directory does not exist", async () => {
    mockExistsSync.mockReturnValue(false);

    const result = await getProjectTree("/projects", "nonexistent");
    expect(result).toEqual([]);
  });

  it("handles subdirectory paths", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue([{ name: "index.ts", isDirectory: () => false, isFile: () => true }] as never);

    const result = await getProjectTree("/projects", "my-app", "src");
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe("src/index.ts");
  });

  it("filters out node_modules", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue([
      { name: "node_modules", isDirectory: () => true, isFile: () => false },
      { name: "src", isDirectory: () => true, isFile: () => false },
    ] as never);

    const result = await getProjectTree("/projects", "my-app");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("src");
  });
});

describe("getProjectFileContent", () => {
  it("returns file content with language detection", async () => {
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({ isDirectory: () => false, size: 100 } as never);
    mockReadFileSync.mockReturnValue("const x = 1;");

    const result = await getProjectFileContent("/projects", "my-app", "src/index.ts");
    expect(result).not.toBeNull();
    expect(result?.content).toBe("const x = 1;");
    expect(result?.language).toBe("typescript");
    expect(result?.isBinary).toBe(false);
  });

  it("returns null for non-existent file", async () => {
    mockExistsSync.mockReturnValue(false);

    const result = await getProjectFileContent("/projects", "my-app", "nonexistent.ts");
    expect(result).toBeNull();
  });

  it("returns null for directory", async () => {
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({ isDirectory: () => true } as never);

    const result = await getProjectFileContent("/projects", "my-app", "src");
    expect(result).toBeNull();
  });

  it("returns binary metadata for binary files", async () => {
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({ isDirectory: () => false, size: 5000 } as never);

    const result = await getProjectFileContent("/projects", "my-app", "image.png");
    expect(result).not.toBeNull();
    expect(result?.isBinary).toBe(true);
    expect(result?.content).toBe("");
    expect(result?.size).toBe(5000);
  });

  it("prevents path traversal", async () => {
    const result = await getProjectFileContent("/projects", "my-app", "../../etc/passwd");
    expect(result).toBeNull();
  });
});
