import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
  queryAll: vi.fn(),
}));

import { GET } from "@/app/api/chapter-markers/route";
import { queryAll } from "@/lib/db";

const mockQueryAll = vi.mocked(queryAll);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/chapter-markers", () => {
  it("returns chapter markers with camelCase keys", async () => {
    mockQueryAll.mockResolvedValue([
      { flow_name: "Login Flow", start_time: "00:00:05" },
      { flow_name: "Dashboard Flow", start_time: "00:02:30" },
    ] as never);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual([
      { flowName: "Login Flow", startTime: "00:00:05" },
      { flowName: "Dashboard Flow", startTime: "00:02:30" },
    ]);
  });

  it("returns 500 on database error", async () => {
    mockQueryAll.mockRejectedValue(new Error("DB error"));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain("Internal server error");
  });
});
