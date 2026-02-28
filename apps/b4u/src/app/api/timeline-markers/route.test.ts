import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
  queryAll: vi.fn(),
  execute: vi.fn(),
}));

import { cast } from "@claudekit/test-utils";
import { GET, PUT } from "@/app/api/timeline-markers/route";
import { execute, queryAll } from "@/lib/db";

const mockQueryAll = vi.mocked(queryAll);
const mockExecute = vi.mocked(execute);

function makeGetRequest(runId: string) {
  return new NextRequest(`http://localhost/api/timeline-markers?runId=${runId}`);
}

function makePutRequest(body: unknown, runId = "run-1") {
  return new NextRequest(`http://localhost/api/timeline-markers?runId=${runId}`, {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/timeline-markers", () => {
  it("returns markers grouped by flow_id from flow_voiceover", async () => {
    mockQueryAll.mockResolvedValue(
      cast([
        {
          flow_id: "flow-1",
          markers_json: JSON.stringify([
            { timestamp: "00:00:05", label: "Login", paragraphIndex: 0 },
            { timestamp: "00:00:15", label: "Dashboard", paragraphIndex: 1 },
          ]),
        },
        {
          flow_id: "flow-2",
          markers_json: JSON.stringify([{ timestamp: "00:01:00", label: "Settings", paragraphIndex: 0 }]),
        },
      ]),
    );

    const response = await GET(makeGetRequest("run-1"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data["flow-1"]).toHaveLength(2);
    expect(data["flow-2"]).toHaveLength(1);
    expect(data["flow-1"][0]).toEqual({ timestamp: "00:00:05", label: "Login", paragraphIndex: 0 });
  });

  it("returns 400 when runId is missing", async () => {
    const response = await GET(new NextRequest("http://localhost/api/timeline-markers"));
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

  it("returns empty object when no markers exist", async () => {
    mockQueryAll.mockResolvedValue(cast([]));

    const response = await GET(makeGetRequest("run-1"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({});
  });
});

describe("PUT /api/timeline-markers", () => {
  it("saves markers for a single flow via flow_voiceover", async () => {
    // No existing row found
    mockQueryAll.mockResolvedValue(cast([]));
    mockExecute.mockResolvedValue(cast(undefined));

    const body = {
      "flow-1": [
        { timestamp: "00:00:05", label: "Login", paragraphIndex: 0 },
        { timestamp: "00:00:15", label: "Dashboard", paragraphIndex: 1 },
      ],
    };

    const response = await PUT(makePutRequest(body));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ ok: true });
  });

  it("updates existing flow_voiceover row markers", async () => {
    mockQueryAll.mockResolvedValue(cast([{ id: "existing-id", paragraphs_json: '["Hello"]' }]));
    mockExecute.mockResolvedValue(cast(undefined));

    const body = {
      "flow-1": [{ timestamp: "00:00:05", label: "Login", paragraphIndex: 0 }],
    };

    const response = await PUT(makePutRequest(body));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ ok: true });
    expect(mockExecute).toHaveBeenCalledWith(
      {},
      "UPDATE flow_voiceover SET markers_json = ? WHERE id = ?",
      expect.any(Array),
    );
  });

  it("returns 400 when runId is missing", async () => {
    const req = new NextRequest("http://localhost/api/timeline-markers", {
      method: "PUT",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });

    const response = await PUT(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("runId is required");
  });

  it("returns 500 when request body is invalid", async () => {
    const request = new NextRequest("http://localhost/api/timeline-markers?runId=run-1", {
      method: "PUT",
      body: "not valid json",
      headers: { "Content-Type": "application/json" },
    });

    const response = await PUT(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain("Internal server error");
  });

  it("returns 500 on database error", async () => {
    mockQueryAll.mockRejectedValue(new Error("DB write error"));

    const body = {
      "flow-1": [{ timestamp: "00:00:05", label: "Login", paragraphIndex: 0 }],
    };

    const response = await PUT(makePutRequest(body));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain("Internal server error");
  });
});
