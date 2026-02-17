import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
  queryAll: vi.fn(),
  execute: vi.fn(),
}));

import { GET, PATCH } from "@/app/api/env-config/route";
import { execute, queryAll } from "@/lib/db";

const mockQueryAll = vi.mocked(queryAll);
const mockExecute = vi.mocked(execute);

function makeGetRequest(runId: string) {
  return new NextRequest(`http://localhost/api/env-config?runId=${runId}`);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/env-config", () => {
  it("returns env items from database", async () => {
    const items = [
      { id: "seed-db", label: "Seed database on start", enabled: true },
      { id: "disable-rate", label: "Disable rate limiting", enabled: true },
    ];
    mockQueryAll.mockResolvedValue(items as never);

    const response = await GET(makeGetRequest("run-1"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(items);
  });

  it("returns 400 when runId is missing", async () => {
    const response = await GET(new NextRequest("http://localhost/api/env-config"));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("runId is required");
  });

  it("returns empty array when no items exist", async () => {
    mockQueryAll.mockResolvedValue([] as never);

    const response = await GET(makeGetRequest("run-1"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual([]);
  });

  it("returns 500 on database error", async () => {
    mockQueryAll.mockRejectedValue(new Error("DB error"));

    const response = await GET(makeGetRequest("run-1"));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain("Internal server error");
  });
});

describe("PATCH /api/env-config", () => {
  it("updates an env item toggle", async () => {
    mockExecute.mockResolvedValue(undefined as never);

    const req = new NextRequest("http://localhost/api/env-config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "seed-db", enabled: false, runId: "run-1" }),
    });

    const response = await PATCH(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("UPDATE env_items SET enabled"),
      expect.arrayContaining([false, "seed-db", "run-1"]),
    );
  });

  it("returns 422 for invalid body (missing id)", async () => {
    const req = new NextRequest("http://localhost/api/env-config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true, runId: "run-1" }),
    });

    const response = await PATCH(req);
    const data = await response.json();

    expect(response.status).toBe(422);
    expect(data.error).toBeTruthy();
  });

  it("returns 422 for invalid body (missing enabled)", async () => {
    const req = new NextRequest("http://localhost/api/env-config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "seed-db", runId: "run-1" }),
    });

    const response = await PATCH(req);
    expect(response.status).toBe(422);
  });

  it("returns 422 for invalid body (missing runId)", async () => {
    const req = new NextRequest("http://localhost/api/env-config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "seed-db", enabled: true }),
    });

    const response = await PATCH(req);
    expect(response.status).toBe(422);
  });

  it("returns 400 for invalid JSON", async () => {
    const req = new NextRequest("http://localhost/api/env-config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "not json{{",
    });

    const response = await PATCH(req);
    expect(response.status).toBe(400);
  });

  it("returns 500 on database error during update", async () => {
    mockExecute.mockRejectedValue(new Error("DB write failed"));

    const req = new NextRequest("http://localhost/api/env-config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "seed-db", enabled: true, runId: "run-1" }),
    });

    const response = await PATCH(req);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain("Internal server error");
  });
});
