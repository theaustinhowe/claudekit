import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:os", () => ({
  default: { homedir: () => "/home/testuser" },
  homedir: () => "/home/testuser",
}));
vi.mock("node:fs/promises", () => ({
  default: {
    realpath: vi.fn(),
    readdir: vi.fn(),
  },
  realpath: vi.fn(),
  readdir: vi.fn(),
}));

import fs from "node:fs/promises";
import { cast } from "@claudekit/test-utils";
import { NextRequest } from "next/server";
import { GET } from "./route";

const mockRealpath = vi.mocked(fs.realpath);
const mockReaddir = vi.mocked(fs.readdir);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/fs/browse", () => {
  it("returns home directory when no path provided", async () => {
    mockRealpath.mockResolvedValue(cast("/home/testuser"));
    mockReaddir.mockResolvedValue(cast([{ name: "Documents", isDirectory: () => true, isFile: () => false }]));

    const req = new NextRequest("http://localhost/api/fs/browse");
    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.currentPath).toBe("/home/testuser");
    expect(data.parentPath).toBeNull();
    expect(data.entries).toHaveLength(1);
    expect(data.entries[0].name).toBe("Documents");
  });

  it("returns directory entries for valid path within home", async () => {
    mockRealpath.mockResolvedValueOnce(cast("/home/testuser/projects"));
    // Main readdir
    mockReaddir.mockResolvedValueOnce(
      cast([
        { name: "src", isDirectory: () => true, isFile: () => false },
        { name: "README.md", isDirectory: () => false, isFile: () => true },
      ]),
    );
    // hasChildren check for "src"
    mockReaddir.mockResolvedValueOnce(cast([{ name: "components", isDirectory: () => true, isFile: () => false }]));

    const req = new NextRequest("http://localhost/api/fs/browse?path=/home/testuser/projects");
    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.currentPath).toBe("/home/testuser/projects");
    expect(data.parentPath).toBe("/home/testuser");
    // Only directories are returned (README.md excluded)
    expect(data.entries).toHaveLength(1);
    expect(data.entries[0].name).toBe("src");
    expect(data.entries[0].hasChildren).toBe(true);
  });

  it("returns 403 for paths outside home directory", async () => {
    const req = new NextRequest("http://localhost/api/fs/browse?path=/etc/passwd");
    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toContain("Access denied");
  });

  it("returns 400 when directory cannot be read", async () => {
    mockRealpath.mockRejectedValue(new Error("ENOENT"));

    const req = new NextRequest("http://localhost/api/fs/browse?path=/home/testuser/nonexistent");
    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("Cannot read directory");
  });
});
