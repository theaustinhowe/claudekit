import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
  queryAll: vi.fn(),
}));

import { GET } from "@/app/api/timeline-markers/route";
import { queryAll } from "@/lib/db";

const mockQueryAll = vi.mocked(queryAll);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/timeline-markers", () => {
  it("returns markers grouped by flow_id", async () => {
    mockQueryAll.mockResolvedValue([
      { flow_id: "flow-1", timestamp: "00:00:05", label: "Login", paragraph_index: 0 },
      { flow_id: "flow-1", timestamp: "00:00:15", label: "Dashboard", paragraph_index: 1 },
      { flow_id: "flow-2", timestamp: "00:01:00", label: "Settings", paragraph_index: 0 },
    ] as never);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data["flow-1"]).toHaveLength(2);
    expect(data["flow-2"]).toHaveLength(1);
    expect(data["flow-1"][0]).toEqual({ timestamp: "00:00:05", label: "Login", paragraphIndex: 0 });
  });

  it("returns 500 on database error", async () => {
    mockQueryAll.mockRejectedValue(new Error("DB error"));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain("Internal server error");
  });
});
