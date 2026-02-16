import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
  queryAll: vi.fn(),
  execute: vi.fn(),
}));
vi.mock("@/lib/validations", () => ({
  parseBody: vi.fn(),
  routesArraySchema: {},
}));

import { GET, PUT } from "@/app/api/routes/route";
import { execute, queryAll } from "@/lib/db";
import { parseBody } from "@/lib/validations";

const mockQueryAll = vi.mocked(queryAll);
const mockExecute = vi.mocked(execute);
const mockParseBody = vi.mocked(parseBody);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/routes", () => {
  it("returns routes with camelCase keys", async () => {
    mockQueryAll.mockResolvedValue([
      { id: 1, path: "/login", title: "Login", auth_required: false, description: "Login page" },
      { id: 2, path: "/dashboard", title: "Dashboard", auth_required: true, description: "Main dashboard" },
    ] as never);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual([
      { path: "/login", title: "Login", authRequired: false, description: "Login page" },
      { path: "/dashboard", title: "Dashboard", authRequired: true, description: "Main dashboard" },
    ]);
  });

  it("returns 500 on database error", async () => {
    mockQueryAll.mockRejectedValue(new Error("DB error"));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain("Internal server error");
  });
});

describe("PUT /api/routes", () => {
  it("replaces all routes", async () => {
    const routes = [{ path: "/home", title: "Home", authRequired: false, description: "Home page" }];
    mockParseBody.mockResolvedValue({ ok: true, data: routes } as never);
    mockExecute.mockResolvedValue(undefined as never);

    const req = new Request("http://localhost/api/routes", {
      method: "PUT",
      body: JSON.stringify(routes),
    });
    const response = await PUT(req as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockExecute).toHaveBeenCalledWith(expect.anything(), "DELETE FROM routes");
  });

  it("returns validation error", async () => {
    mockParseBody.mockResolvedValue({ ok: false, error: "Invalid data", status: 422 } as never);

    const req = new Request("http://localhost/api/routes", {
      method: "PUT",
      body: "{}",
    });
    const response = await PUT(req as never);
    const data = await response.json();

    expect(response.status).toBe(422);
    expect(data.error).toBe("Invalid data");
  });
});
