import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
  queryAll: vi.fn(),
  execute: vi.fn(),
}));
vi.mock("@/lib/validations", () => ({
  parseBody: vi.fn(),
  voiceoverScriptsSchema: {},
}));

import { GET, PUT } from "@/app/api/voiceover-scripts/route";
import { execute, queryAll } from "@/lib/db";
import { parseBody } from "@/lib/validations";

const mockQueryAll = vi.mocked(queryAll);
const mockExecute = vi.mocked(execute);
const mockParseBody = vi.mocked(parseBody);

function makeGetRequest(runId: string) {
  return new NextRequest(`http://localhost/api/voiceover-scripts?runId=${runId}`);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/voiceover-scripts", () => {
  it("returns scripts grouped by flow_id from flow_voiceover", async () => {
    mockQueryAll.mockResolvedValue([
      { flow_id: "flow-1", paragraphs_json: JSON.stringify(["Welcome to the app", "Click the login button"]) },
      { flow_id: "flow-2", paragraphs_json: JSON.stringify(["Now view your dashboard"]) },
    ] as never);

    const response = await GET(makeGetRequest("run-1"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data["flow-1"]).toEqual(["Welcome to the app", "Click the login button"]);
    expect(data["flow-2"]).toEqual(["Now view your dashboard"]);
  });

  it("returns 400 when runId is missing", async () => {
    const response = await GET(new NextRequest("http://localhost/api/voiceover-scripts"));
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

describe("PUT /api/voiceover-scripts", () => {
  it("updates voiceover scripts in flow_voiceover", async () => {
    const scripts = { "flow-1": ["Script 1", "Script 2"] };
    mockParseBody.mockResolvedValue({ ok: true, data: scripts } as never);
    mockQueryAll.mockResolvedValue([] as never); // no existing rows
    mockExecute.mockResolvedValue(undefined as never);

    const req = new NextRequest("http://localhost/api/voiceover-scripts?runId=run-1", {
      method: "PUT",
      body: JSON.stringify(scripts),
    });
    const response = await PUT(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it("returns 400 when runId is missing", async () => {
    const req = new NextRequest("http://localhost/api/voiceover-scripts", {
      method: "PUT",
      body: JSON.stringify({}),
    });
    const response = await PUT(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("runId is required");
  });

  it("returns validation error", async () => {
    mockParseBody.mockResolvedValue({ ok: false, error: "Invalid", status: 422 } as never);

    const req = new NextRequest("http://localhost/api/voiceover-scripts?runId=run-1", { method: "PUT", body: "{}" });
    const response = await PUT(req);

    expect(response.status).toBe(422);
  });
});
