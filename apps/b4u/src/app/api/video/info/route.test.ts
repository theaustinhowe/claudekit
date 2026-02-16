import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
  queryAll: vi.fn(),
}));

import { GET } from "@/app/api/video/info/route";
import { queryAll } from "@/lib/db";

const mockQueryAll = vi.mocked(queryAll);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/video/info", () => {
  it("returns latest video info", async () => {
    mockQueryAll.mockResolvedValue([{ id: "vid-001", file_path: "/tmp/final.mp4", duration_seconds: 120 }] as never);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      id: "vid-001",
      durationSeconds: 120,
    });
  });

  it("returns 404 when no videos exist", async () => {
    mockQueryAll.mockResolvedValue([] as never);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("No final video found");
  });

  it("converts duration string to number", async () => {
    mockQueryAll.mockResolvedValue([{ id: "vid-002", file_path: "/tmp/out.mp4", duration_seconds: "45.5" }] as never);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.durationSeconds).toBe(45.5);
  });

  it("returns 500 on database error", async () => {
    mockQueryAll.mockRejectedValue(new Error("DB error"));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Internal server error");
  });
});
