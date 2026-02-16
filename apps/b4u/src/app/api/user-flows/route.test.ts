import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
  queryAll: vi.fn(),
  execute: vi.fn(),
}));
vi.mock("@/lib/validations", () => ({
  parseBody: vi.fn(),
  userFlowsArraySchema: {},
}));

import { GET, PUT } from "@/app/api/user-flows/route";
import { execute, queryAll } from "@/lib/db";
import { parseBody } from "@/lib/validations";

const mockQueryAll = vi.mocked(queryAll);
const mockExecute = vi.mocked(execute);
const mockParseBody = vi.mocked(parseBody);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/user-flows", () => {
  it("returns user flows", async () => {
    const flows = [{ id: "flow-1", name: "Login Flow", steps: ["Go to login", "Enter credentials"] }];
    mockQueryAll.mockResolvedValue(flows as never);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(flows);
  });

  it("returns 500 on database error", async () => {
    mockQueryAll.mockRejectedValue(new Error("DB error"));

    const response = await GET();
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

    const req = new Request("http://localhost/api/user-flows", {
      method: "PUT",
      body: JSON.stringify(flows),
    });
    const response = await PUT(req as never);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it("returns validation error", async () => {
    mockParseBody.mockResolvedValue({ ok: false, error: "Invalid", status: 422 } as never);

    const req = new Request("http://localhost/api/user-flows", { method: "PUT", body: "{}" });
    const response = await PUT(req as never);

    expect(response.status).toBe(422);
  });
});
