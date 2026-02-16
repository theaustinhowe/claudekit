import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => ({
  default: {
    realpath: vi.fn(),
    readdir: vi.fn(),
  },
}));
vi.mock("node:os", () => ({
  default: {
    homedir: vi.fn(() => "/Users/testuser"),
  },
}));

import fs from "node:fs/promises";
import { NextRequest } from "next/server";
import { GET } from "./route";

const mockRealpath = vi.mocked(fs.realpath);
const mockReaddir = vi.mocked(fs.readdir);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/fs/browse", () => {
  it("returns directory entries for home path", async () => {
    mockRealpath.mockResolvedValue("/Users/testuser" as never);
    mockReaddir.mockResolvedValue([
      { name: "Documents", isDirectory: () => true },
      { name: "file.txt", isDirectory: () => false },
    ] as never);

    const req = new NextRequest("http://localhost/api/fs/browse?path=~");
    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.currentPath).toBe("/Users/testuser");
  });

  it("returns 403 for path outside home directory", async () => {
    const req = new NextRequest("http://localhost/api/fs/browse?path=/etc/passwd");
    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toContain("Access denied");
  });
});
