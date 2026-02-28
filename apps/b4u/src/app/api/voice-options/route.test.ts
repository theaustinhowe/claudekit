import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
  queryAll: vi.fn(),
}));

import { cast } from "@claudekit/test-utils";
import { GET } from "@/app/api/voice-options/route";
import { queryAll } from "@/lib/db";

const mockQueryAll = vi.mocked(queryAll);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/voice-options", () => {
  it("returns voice options from database", async () => {
    const voices = [
      { id: "v1", name: "Alice", style: "conversational" },
      { id: "v2", name: "Bob", style: "professional" },
    ];
    mockQueryAll.mockResolvedValue(cast(voices));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(voices);
  });

  it("returns 500 on database error", async () => {
    mockQueryAll.mockRejectedValue(new Error("DB error"));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain("Internal server error");
  });
});
