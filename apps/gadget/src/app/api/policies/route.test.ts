import { cast } from "@claudekit/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(() => ({})),
  queryAll: vi.fn(),
  execute: vi.fn(),
}));
vi.mock("@/lib/utils", () => ({
  generateId: vi.fn(() => "test-id"),
  nowTimestamp: vi.fn(() => "2024-01-01T00:00:00.000Z"),
  parsePolicy: vi.fn((row: Record<string, unknown>) => row),
}));

import { NextRequest } from "next/server";
import { execute, queryAll } from "@/lib/db";
import { GET, POST, PUT } from "./route";

const mockQueryAll = vi.mocked(queryAll);
const mockExecute = vi.mocked(execute);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/policies", () => {
  it("returns policies", async () => {
    mockQueryAll.mockResolvedValue(cast([{ id: "p1", name: "Default" }]));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveLength(1);
  });
});

describe("POST /api/policies", () => {
  it("creates a policy", async () => {
    mockExecute.mockResolvedValue(cast(undefined));

    const req = new NextRequest("http://localhost/api/policies", {
      method: "POST",
      body: JSON.stringify({ name: "New Policy" }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.id).toBe("test-id");
    expect(mockExecute).toHaveBeenCalledWith({}, expect.stringContaining("INSERT INTO policies"), expect.any(Array));
  });
});

describe("PUT /api/policies", () => {
  it("updates a policy", async () => {
    mockExecute.mockResolvedValue(cast(undefined));

    const req = new NextRequest("http://localhost/api/policies", {
      method: "PUT",
      body: JSON.stringify({ id: "p1", name: "Updated" }),
    });

    const response = await PUT(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it("returns 400 when id missing", async () => {
    const req = new NextRequest("http://localhost/api/policies", {
      method: "PUT",
      body: JSON.stringify({ name: "No Id" }),
    });

    const response = await PUT(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("Missing id");
  });
});
