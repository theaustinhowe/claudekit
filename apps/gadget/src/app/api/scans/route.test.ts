import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(() => ({})),
  queryAll: vi.fn(),
}));

import { queryAll } from "@/lib/db";
import { GET } from "./route";

const mockQueryAll = vi.mocked(queryAll);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/scans", () => {
  it("returns scans ordered by created_at desc", async () => {
    mockQueryAll.mockResolvedValue([
      { id: "s1", created_at: "2024-01-02" },
      { id: "s2", created_at: "2024-01-01" },
    ] as never);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveLength(2);
    expect(mockQueryAll).toHaveBeenCalledWith({}, expect.stringContaining("ORDER BY created_at DESC"));
  });
});
