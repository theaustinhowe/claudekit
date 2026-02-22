import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
  queryOne: vi.fn(),
  execute: vi.fn(),
}));
vi.mock("@/lib/validations", () => ({
  parseBody: vi.fn(),
  userFlowsArraySchema: {},
}));

import { GET, PUT } from "@/app/api/user-flows/route";
import { execute, queryOne } from "@/lib/db";
import { parseBody } from "@/lib/validations";

const mockQueryOne = vi.mocked(queryOne);
const mockExecute = vi.mocked(execute);
const mockParseBody = vi.mocked(parseBody);

function makeGetRequest(runId: string) {
  return new NextRequest(`http://localhost/api/user-flows?runId=${runId}`);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/user-flows", () => {
  it("returns user flows", async () => {
    const flows = [{ id: "flow-1", name: "Login Flow", steps: ["Go to login", "Enter credentials"] }];
    mockQueryOne.mockResolvedValue({ data_json: JSON.stringify(flows) } as never);

    const response = await GET(makeGetRequest("run-1"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(flows);
  });

  it("returns 400 when runId is missing", async () => {
    const response = await GET(new NextRequest("http://localhost/api/user-flows"));
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

describe("PUT /api/user-flows", () => {
  it("replaces all user flows", async () => {
    const flows = [{ id: "f1", name: "Flow 1", steps: ["Step 1"] }];
    mockParseBody.mockResolvedValue({ ok: true, data: flows } as never);
    mockExecute.mockResolvedValue(undefined as never);

    const req = new NextRequest("http://localhost/api/user-flows?runId=run-1", {
      method: "PUT",
      body: JSON.stringify(flows),
    });
    const response = await PUT(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it("returns 400 when runId is missing", async () => {
    const req = new NextRequest("http://localhost/api/user-flows", {
      method: "PUT",
      body: JSON.stringify([]),
    });
    const response = await PUT(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("runId is required");
  });

  it("returns validation error", async () => {
    mockParseBody.mockResolvedValue({ ok: false, error: "Invalid", status: 422 } as never);

    const req = new NextRequest("http://localhost/api/user-flows?runId=run-1", { method: "PUT", body: "{}" });
    const response = await PUT(req);

    expect(response.status).toBe(422);
  });
});
