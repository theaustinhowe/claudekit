import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
  queryAll: vi.fn(),
}));

import { GET } from "@/app/api/runs/[runId]/validate-phase/route";
import { queryAll } from "@/lib/db";

const mockQueryAll = vi.mocked(queryAll);

beforeEach(() => {
  vi.clearAllMocks();
});

const makeRequest = (runId: string, phase: number) =>
  GET(new Request(`http://localhost/api/runs/${runId}/validate-phase?phase=${phase}`), {
    params: Promise.resolve({ runId }),
  });

describe("GET /api/runs/[runId]/validate-phase", () => {
  it("returns 400 when phase param is missing", async () => {
    const response = await GET(new Request("http://localhost/api/runs/run-1/validate-phase"), {
      params: Promise.resolve({ runId: "run-1" }),
    });
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("phase");
  });

  it("returns valid for phase 1 (no prerequisites)", async () => {
    const response = await makeRequest("run-1", 1);
    const data = await response.json();
    expect(data.valid).toBe(true);
  });

  it("returns invalid for phase 2 when project_summary missing", async () => {
    mockQueryAll.mockResolvedValueOnce([{ cnt: 0 }] as never);

    const response = await makeRequest("run-1", 2);
    const data = await response.json();

    expect(data.valid).toBe(false);
    expect(data.message).toContain("Phase 1");
  });

  it("returns valid for phase 2 when project_summary exists", async () => {
    mockQueryAll.mockResolvedValueOnce([{ cnt: 1 }] as never);

    const response = await makeRequest("run-1", 2);
    const data = await response.json();

    expect(data.valid).toBe(true);
  });

  it("returns invalid for phase 3 when routes/flows missing", async () => {
    mockQueryAll.mockResolvedValueOnce([{ cnt: 1 }] as never); // only 1 of 2 needed

    const response = await makeRequest("run-1", 3);
    const data = await response.json();

    expect(data.valid).toBe(false);
    expect(data.message).toContain("Phase 2");
  });

  it("returns valid for phase 3 when routes and flows exist", async () => {
    mockQueryAll.mockResolvedValueOnce([{ cnt: 2 }] as never);

    const response = await makeRequest("run-1", 3);
    const data = await response.json();

    expect(data.valid).toBe(true);
  });

  it("returns invalid for phase 5 when flow_scripts missing", async () => {
    mockQueryAll.mockResolvedValueOnce([{ cnt: 0 }] as never);

    const response = await makeRequest("run-1", 5);
    const data = await response.json();

    expect(data.valid).toBe(false);
    expect(data.message).toContain("Phase 4");
  });

  it("returns invalid for phase 6 when no completed recordings", async () => {
    mockQueryAll.mockResolvedValueOnce([{ cnt: 0 }] as never);

    const response = await makeRequest("run-1", 6);
    const data = await response.json();

    expect(data.valid).toBe(false);
    expect(data.message).toContain("Phase 5");
  });

  it("returns invalid for phase 7 when flow_voiceover missing", async () => {
    mockQueryAll.mockResolvedValueOnce([{ cnt: 0 }] as never);

    const response = await makeRequest("run-1", 7);
    const data = await response.json();

    expect(data.valid).toBe(false);
    expect(data.message).toContain("Phase 6");
  });

  it("returns 500 on database error", async () => {
    mockQueryAll.mockRejectedValueOnce(new Error("DB error"));

    const response = await makeRequest("run-1", 2);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toContain("DB error");
  });
});
