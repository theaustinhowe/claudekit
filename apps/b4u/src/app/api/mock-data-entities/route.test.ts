import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
  queryOne: vi.fn(),
}));

import { cast } from "@claudekit/test-utils";
import { GET } from "@/app/api/mock-data-entities/route";
import { queryOne } from "@/lib/db";

const mockQueryOne = vi.mocked(queryOne);

function makeGetRequest(runId: string) {
  return new NextRequest(`http://localhost/api/mock-data-entities?runId=${runId}`);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/mock-data-entities", () => {
  it("returns mock data entities", async () => {
    const entities = [
      { name: "User", count: 10, note: "Admin + regular" },
      { name: "Product", count: 50, note: "Various categories" },
    ];
    mockQueryOne.mockResolvedValue(cast({ data_json: JSON.stringify(entities) }));

    const response = await GET(makeGetRequest("run-1"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(entities);
  });

  it("returns 400 when runId is missing", async () => {
    const response = await GET(new NextRequest("http://localhost/api/mock-data-entities"));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("runId is required");
  });

  it("returns empty array when no items exist", async () => {
    mockQueryOne.mockResolvedValue(cast(null));

    const response = await GET(makeGetRequest("run-1"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual([]);
  });

  it("returns 500 on database error", async () => {
    mockQueryOne.mockRejectedValue(new Error("DB error"));

    const response = await GET(makeGetRequest("run-1"));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain("Internal server error");
  });
});
