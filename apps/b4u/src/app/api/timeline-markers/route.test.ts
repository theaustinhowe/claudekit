import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
  queryAll: vi.fn(),
  execute: vi.fn(),
}));

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
  it("returns markers grouped by flow_id", async () => {
    mockQueryAll.mockResolvedValue([
      { flow_id: "flow-1", timestamp: "00:00:05", label: "Login", paragraph_index: 0 },
      { flow_id: "flow-1", timestamp: "00:00:15", label: "Dashboard", paragraph_index: 1 },
      { flow_id: "flow-2", timestamp: "00:01:00", label: "Settings", paragraph_index: 0 },
    ] as never);

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
    mockQueryAll.mockResolvedValue([] as never);

    const response = await GET(makeGetRequest("run-1"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({});
  });
});

describe("PUT /api/timeline-markers", () => {
  it("saves markers for a single flow", async () => {
    mockExecute.mockResolvedValue(undefined as never);

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

    // 1 delete + 2 inserts
    expect(mockExecute).toHaveBeenCalledTimes(3);
    expect(mockExecute).toHaveBeenCalledWith({}, "DELETE FROM timeline_markers WHERE flow_id = ? AND run_id = ?", [
      "flow-1",
      "run-1",
    ]);
    expect(mockExecute).toHaveBeenCalledWith(
      {},
      "INSERT INTO timeline_markers (run_id, flow_id, timestamp, label, paragraph_index) VALUES (?, ?, ?, ?, ?)",
      ["run-1", "flow-1", "00:00:05", "Login", 0],
    );
    expect(mockExecute).toHaveBeenCalledWith(
      {},
      "INSERT INTO timeline_markers (run_id, flow_id, timestamp, label, paragraph_index) VALUES (?, ?, ?, ?, ?)",
      ["run-1", "flow-1", "00:00:15", "Dashboard", 1],
    );
  });

  it("processes multiple flows", async () => {
    mockExecute.mockResolvedValue(undefined as never);

    const body = {
      "flow-1": [{ timestamp: "00:00:05", label: "Login", paragraphIndex: 0 }],
      "flow-2": [
        { timestamp: "00:01:00", label: "Settings", paragraphIndex: 0 },
        { timestamp: "00:01:30", label: "Profile", paragraphIndex: 1 },
      ],
    };

    const response = await PUT(makePutRequest(body));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ ok: true });

    // 2 deletes + 3 inserts
    expect(mockExecute).toHaveBeenCalledTimes(5);
    expect(mockExecute).toHaveBeenCalledWith({}, "DELETE FROM timeline_markers WHERE flow_id = ? AND run_id = ?", [
      "flow-1",
      "run-1",
    ]);
    expect(mockExecute).toHaveBeenCalledWith({}, "DELETE FROM timeline_markers WHERE flow_id = ? AND run_id = ?", [
      "flow-2",
      "run-1",
    ]);
  });

  it("handles empty markers array for a flow", async () => {
    mockExecute.mockResolvedValue(undefined as never);

    const body = {
      "flow-1": [],
    };

    const response = await PUT(makePutRequest(body));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ ok: true });

    // Only 1 delete, no inserts
    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(mockExecute).toHaveBeenCalledWith({}, "DELETE FROM timeline_markers WHERE flow_id = ? AND run_id = ?", [
      "flow-1",
      "run-1",
    ]);
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
    mockExecute.mockRejectedValue(new Error("DB write error"));

    const body = {
      "flow-1": [{ timestamp: "00:00:05", label: "Login", paragraphIndex: 0 }],
    };

    const response = await PUT(makePutRequest(body));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain("Internal server error");
  });
});
