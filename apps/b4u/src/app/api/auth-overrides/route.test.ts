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

import { GET, PATCH } from "@/app/api/auth-overrides/route";
import { execute, queryOne } from "@/lib/db";
import { parseBody } from "@/lib/validations";

const mockQueryOne = vi.mocked(queryOne);
const mockExecute = vi.mocked(execute);
const mockParseBody = vi.mocked(parseBody);

function makeGetRequest(runId: string) {
  return new NextRequest(`http://localhost/api/auth-overrides?runId=${runId}`);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/auth-overrides", () => {
  it("returns auth overrides from run_content", async () => {
    const overrides = [
      { id: "bypass-login", label: "Bypass login", enabled: true },
      { id: "skip-mfa", label: "Skip MFA", enabled: false },
    ];
    mockQueryOne.mockResolvedValue({ data_json: JSON.stringify(overrides) } as never);

    const response = await GET(makeGetRequest("run-1"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(overrides);
  });

  it("returns 400 when runId is missing", async () => {
    const response = await GET(new NextRequest("http://localhost/api/auth-overrides"));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("runId is required");
  });

  it("returns 500 on database error", async () => {
    mockQueryOne.mockRejectedValue(new Error("DB error"));

    const response = await GET(makeGetRequest("run-1"));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain("Internal server error");
  });
});

describe("PATCH /api/auth-overrides", () => {
  it("updates an auth override toggle in run_content", async () => {
    mockParseBody.mockResolvedValue({
      ok: true,
      data: { id: "bypass-login", enabled: false, runId: "run-1" },
    } as never);
    mockQueryOne.mockResolvedValue({
      id: "rc-1",
      data_json: JSON.stringify([
        { id: "bypass-login", label: "Bypass login", enabled: true },
        { id: "skip-mfa", label: "Skip MFA", enabled: false },
      ]),
    } as never);
    mockExecute.mockResolvedValue(undefined as never);

    const req = new NextRequest("http://localhost/api/auth-overrides", {
      method: "PATCH",
      body: JSON.stringify({ id: "bypass-login", enabled: false, runId: "run-1" }),
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

  it("returns validation error", async () => {
    mockParseBody.mockResolvedValue({ ok: false, error: "Invalid", status: 422 } as never);

    const req = new NextRequest("http://localhost/api/auth-overrides", {
      method: "PATCH",
      body: "{}",
    });
    const response = await PATCH(req);

    expect(response.status).toBe(422);
  });
});
