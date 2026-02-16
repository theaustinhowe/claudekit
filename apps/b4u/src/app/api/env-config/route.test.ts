import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  query: vi.fn(),
  execute: vi.fn(),
  executePrepared: vi.fn(),
}));

import { GET, PATCH } from "@/app/api/env-config/route";
import { executePrepared, query } from "@/lib/db";

const mockQuery = vi.mocked(query);
const mockExecutePrepared = vi.mocked(executePrepared);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/env-config", () => {
  it("returns env items from database", async () => {
    const items = [
      { id: "seed-db", label: "Seed database on start", enabled: true },
      { id: "disable-rate", label: "Disable rate limiting", enabled: true },
    ];
    mockQuery.mockResolvedValue(items as never);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(items);
  });

  it("returns empty array when no items exist", async () => {
    mockQuery.mockResolvedValue([] as never);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual([]);
  });

  it("returns 500 on database error", async () => {
    mockQuery.mockRejectedValue(new Error("DB error"));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain("Internal server error");
  });
});

describe("PATCH /api/env-config", () => {
  it("updates an env item toggle", async () => {
    mockExecutePrepared.mockResolvedValue(undefined);

    const req = new Request("http://localhost/api/env-config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "seed-db", enabled: false }),
    });

    const response = await PATCH(req as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockExecutePrepared).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE env_items SET enabled"),
      expect.objectContaining({ $id: "seed-db", $enabled: false }),
    );
  });

  it("returns 422 for invalid body (missing id)", async () => {
    const req = new Request("http://localhost/api/env-config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    });

    const response = await PATCH(req as never);
    const data = await response.json();

    expect(response.status).toBe(422);
    expect(data.error).toBeTruthy();
  });

  it("returns 422 for invalid body (missing enabled)", async () => {
    const req = new Request("http://localhost/api/env-config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "seed-db" }),
    });

    const response = await PATCH(req as never);
    expect(response.status).toBe(422);
  });

  it("returns 400 for invalid JSON", async () => {
    const req = new Request("http://localhost/api/env-config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "not json{{",
    });

    const response = await PATCH(req as never);
    expect(response.status).toBe(400);
  });

  it("returns 500 on database error during update", async () => {
    mockExecutePrepared.mockRejectedValue(new Error("DB write failed"));

    const req = new Request("http://localhost/api/env-config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "seed-db", enabled: true }),
    });

    const response = await PATCH(req as never);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain("Internal server error");
  });
});
