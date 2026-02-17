import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
  queryAll: vi.fn(),
  execute: vi.fn(),
}));
vi.mock("@/lib/validations", () => ({
  parseBody: vi.fn(),
  flowScriptsArraySchema: {},
}));

import { GET, PUT } from "@/app/api/flow-scripts/route";
import { execute, queryAll } from "@/lib/db";
import { parseBody } from "@/lib/validations";

const mockQueryAll = vi.mocked(queryAll);
const mockExecute = vi.mocked(execute);
const mockParseBody = vi.mocked(parseBody);

function makeGetRequest(runId: string) {
  return new NextRequest(`http://localhost/api/flow-scripts?runId=${runId}`);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/flow-scripts", () => {
  it("returns flow scripts with steps", async () => {
    // First call returns flows, second returns steps
    mockQueryAll.mockResolvedValueOnce([{ flow_id: "flow-1", flow_name: "Login" }] as never).mockResolvedValueOnce([
      {
        id: "s1",
        flow_id: "flow-1",
        step_number: 1,
        url: "/login",
        action: "Click login",
        expected_outcome: "Login form shown",
        duration: "5s",
      },
    ] as never);

    const response = await GET(makeGetRequest("run-1"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveLength(1);
    expect(data[0].flowId).toBe("flow-1");
    expect(data[0].flowName).toBe("Login");
    expect(data[0].steps).toHaveLength(1);
    expect(data[0].steps[0].stepNumber).toBe(1);
  });

  it("returns 400 when runId is missing", async () => {
    const response = await GET(new NextRequest("http://localhost/api/flow-scripts"));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("runId is required");
  });

  it("returns 500 on database error", async () => {
    mockQueryAll.mockRejectedValue(new Error("DB error"));

    const response = await GET(makeGetRequest("run-1"));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain("Internal server error");
  });
});

describe("PUT /api/flow-scripts", () => {
  it("replaces all flow scripts", async () => {
    const scripts = [
      {
        flowId: "flow-1",
        steps: [{ id: "s1", stepNumber: 1, url: "/", action: "Visit", expectedOutcome: "Page loads", duration: "3s" }],
      },
    ];
    mockParseBody.mockResolvedValue({ ok: true, data: scripts } as never);
    mockExecute.mockResolvedValue(undefined as never);

    const req = new NextRequest("http://localhost/api/flow-scripts?runId=run-1", {
      method: "PUT",
      body: JSON.stringify(scripts),
    });
    const response = await PUT(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockExecute).toHaveBeenCalledWith(expect.anything(), "DELETE FROM script_steps WHERE run_id = ?", ["run-1"]);
  });

  it("returns 400 when runId is missing", async () => {
    const req = new NextRequest("http://localhost/api/flow-scripts", {
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

    const req = new NextRequest("http://localhost/api/flow-scripts?runId=run-1", { method: "PUT", body: "{}" });
    const response = await PUT(req);

    expect(response.status).toBe(422);
  });
});
