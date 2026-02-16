import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
  queryAll: vi.fn(),
}));
vi.mock("node:fs", () => ({
  createReadStream: vi.fn(),
  statSync: vi.fn(),
}));

import { createReadStream, statSync } from "node:fs";
import { GET } from "@/app/api/video/serve/[id]/route";
import { queryAll } from "@/lib/db";

const mockQueryAll = vi.mocked(queryAll);
const mockStatSync = vi.mocked(statSync);
const mockCreateReadStream = vi.mocked(createReadStream);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/video/serve/[id]", () => {
  it("returns 404 when video not found", async () => {
    mockQueryAll.mockResolvedValue([] as never);

    const req = new Request("http://localhost/api/video/serve/vid-1");
    const response = await GET(req, { params: Promise.resolve({ id: "vid-1" }) });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toContain("Video not found");
  });

  it("streams full video without range header", async () => {
    mockQueryAll.mockResolvedValue([{ file_path: "/videos/out.mp4", format: "mp4" }] as never);
    mockStatSync.mockReturnValue({ size: 1024 } as never);

    const { Readable } = await import("node:stream");
    const readable = new Readable({
      read() {
        this.push(null);
      },
    });
    mockCreateReadStream.mockReturnValue(readable as never);

    const req = new Request("http://localhost/api/video/serve/vid-1");
    const response = await GET(req, { params: Promise.resolve({ id: "vid-1" }) });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("video/mp4");
    expect(response.headers.get("Content-Length")).toBe("1024");
  });

  it("returns 500 when file not accessible", async () => {
    mockQueryAll.mockResolvedValue([{ file_path: "/missing/video.mp4", format: "mp4" }] as never);
    mockStatSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });

    const req = new Request("http://localhost/api/video/serve/vid-1");
    const response = await GET(req, { params: Promise.resolve({ id: "vid-1" }) });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain("not accessible");
  });
});
