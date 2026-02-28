import { cast } from "@claudekit/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(() => ({})),
  queryAll: vi.fn(),
}));

import { NextRequest } from "next/server";
import { queryAll } from "@/lib/db";
import { GET } from "./route";

const mockQueryAll = vi.mocked(queryAll);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/fixes", () => {
  it("returns fixes ordered by created_at", async () => {
    mockQueryAll.mockResolvedValue(cast([{ id: "fix-1", repo_id: "r1" }]));

    const req = new NextRequest("http://localhost/api/fixes");
    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveLength(1);
  });

  it("filters by repoId and scanId", async () => {
    mockQueryAll.mockResolvedValue(cast([]));

    const req = new NextRequest("http://localhost/api/fixes?repoId=r1&scanId=s1");
    await GET(req);

    expect(mockQueryAll).toHaveBeenCalledWith(
      {},
      expect.stringContaining("repo_id = ?"),
      expect.arrayContaining(["r1", "s1"]),
    );
  });
});
