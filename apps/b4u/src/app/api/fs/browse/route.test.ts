import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => ({
  stat: vi.fn(),
}));
vi.mock("@/lib/fs/scanner", () => ({
  readDirectory: vi.fn(),
}));

import { stat } from "node:fs/promises";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/fs/browse/route";
import { readDirectory } from "@/lib/fs/scanner";

const mockStat = vi.mocked(stat);
const mockReadDirectory = vi.mocked(readDirectory);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/fs/browse", () => {
  it("returns home directory when no path provided", async () => {
    mockReadDirectory.mockResolvedValue([{ name: "Documents", isDirectory: true }] as never);

    const req = new NextRequest("http://localhost/api/fs/browse");
    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.entries).toHaveLength(1);
    expect(mockReadDirectory).toHaveBeenCalled();
  });

  it("returns directory entries for valid path", async () => {
    mockStat.mockResolvedValue({ isDirectory: () => true } as never);
    mockReadDirectory.mockResolvedValue([
      { name: "src", isDirectory: true },
      { name: "README.md", isDirectory: false },
    ] as never);

    const req = new NextRequest("http://localhost/api/fs/browse?path=/projects/app");
    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.path).toBe("/projects/app");
    expect(data.entries).toHaveLength(2);
  });

  it("returns 400 when path is not a directory", async () => {
    mockStat.mockResolvedValue({ isDirectory: () => false } as never);

    const req = new NextRequest("http://localhost/api/fs/browse?path=/projects/file.txt");
    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("not a directory");
  });

  it("returns 404 when path not found", async () => {
    mockStat.mockRejectedValue(new Error("ENOENT"));

    const req = new NextRequest("http://localhost/api/fs/browse?path=/nonexistent");
    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toContain("not found");
  });
});
