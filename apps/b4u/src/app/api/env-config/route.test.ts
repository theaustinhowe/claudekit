import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
  queryOne: vi.fn(),
  execute: vi.fn(),
}));
vi.mock("@/lib/validations", () => ({
  parseBody: vi.fn(),
  togglePatchSchema: {},
}));

import { GET, PATCH } from "@/app/api/env-config/route";
import { execute, queryOne } from "@/lib/db";
import { parseBody } from "@/lib/validations";

const mockQueryOne = vi.mocked(queryOne);
const mockExecute = vi.mocked(execute);
const mockParseBody = vi.mocked(parseBody);

function makeGetRequest(runId: string) {
  return new NextRequest(`http://localhost/api/env-config?runId=${runId}`);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/env-config", () => {
  it("returns env items from run_content", async () => {
    const items = [
      { id: "seed-db", label: "Seed database on start", enabled: true },
      { id: "disable-rate", label: "Disable rate limiting", enabled: true },
    ];
    mockQueryOne.mockResolvedValue({ data_json: JSON.stringify(items) } as never);

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
    mockQueryOne.mockResolvedValue(null as never);

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

describe("PATCH /api/env-config", () => {
  it("updates an env item toggle in run_content", async () => {
    mockParseBody.mockResolvedValue({
      ok: true,
      data: { id: "seed-db", enabled: false, runId: "run-1" },
    } as never);
    mockQueryOne.mockResolvedValue({
      id: "rc-1",
      data_json: JSON.stringify([
        { id: "seed-db", label: "Seed database on start", enabled: true },
        { id: "disable-rate", label: "Disable rate limiting", enabled: true },
      ]),
    } as never);
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
      "UPDATE run_content SET data_json = ? WHERE id = ?",
      expect.any(Array),
    );
  });

  it("returns 422 for invalid body (missing id)", async () => {
    mockParseBody.mockResolvedValue({ ok: false, error: "Invalid", status: 422 } as never);

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

  it("returns 500 on database error during update", async () => {
    mockParseBody.mockResolvedValue({
      ok: true,
      data: { id: "seed-db", enabled: true, runId: "run-1" },
    } as never);
    mockQueryOne.mockRejectedValue(new Error("DB write failed"));

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
