import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
  queryOne: vi.fn(),
  execute: vi.fn(),
}));
vi.mock("@/lib/validations", () => ({
  parseBody: vi.fn(),
  routesArraySchema: {},
}));

import { cast } from "@claudekit/test-utils";
import { GET, PUT } from "@/app/api/routes/route";
import { execute, queryOne } from "@/lib/db";
import { parseBody } from "@/lib/validations";

const mockQueryOne = vi.mocked(queryOne);
const mockExecute = vi.mocked(execute);
const mockParseBody = vi.mocked(parseBody);

function makeGetRequest(runId: string) {
  return new NextRequest(`http://localhost/api/routes?runId=${runId}`);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/routes", () => {
  it("returns routes from run_content", async () => {
    const routes = [
      { path: "/login", title: "Login", authRequired: false, description: "Login page" },
      { path: "/dashboard", title: "Dashboard", authRequired: true, description: "Main dashboard" },
    ];
    mockQueryOne.mockResolvedValue(cast({ data_json: JSON.stringify(routes) }));

    const response = await GET(makeGetRequest("run-1"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(routes);
  });

  it("returns 400 when runId is missing", async () => {
    const response = await GET(new NextRequest("http://localhost/api/routes"));
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

describe("PUT /api/routes", () => {
  it("replaces all routes in run_content", async () => {
    const routes = [{ path: "/home", title: "Home", authRequired: false, description: "Home page" }];
    mockParseBody.mockResolvedValue(cast({ ok: true, data: routes }));
    mockExecute.mockResolvedValue(cast(undefined));

    const req = new NextRequest("http://localhost/api/routes?runId=run-1", {
      method: "PUT",
      body: JSON.stringify(routes),
    });
    const response = await PUT(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.anything(),
      "DELETE FROM run_content WHERE run_id = ? AND content_type = 'routes'",
      ["run-1"],
    );
  });

  it("returns 400 when runId is missing", async () => {
    const req = new NextRequest("http://localhost/api/routes", {
      method: "PUT",
      body: JSON.stringify([]),
    });
    const response = await PUT(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("runId is required");
  });

  it("returns validation error", async () => {
    mockParseBody.mockResolvedValue(cast({ ok: false, error: "Invalid data", status: 422 }));

    const req = new NextRequest("http://localhost/api/routes?runId=run-1", {
      method: "PUT",
      body: "{}",
    });
    const response = await PUT(req);
    const data = await response.json();

    expect(response.status).toBe(422);
    expect(data.error).toBe("Invalid data");
  });
});
