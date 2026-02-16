import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
  queryAll: vi.fn(),
  execute: vi.fn(),
}));

import { DELETE, GET } from "@/app/api/runs/[runId]/route";
import { execute, queryAll } from "@/lib/db";

const mockQueryAll = vi.mocked(queryAll);
const mockExecute = vi.mocked(execute);

beforeEach(() => {
  vi.clearAllMocks();
});

const makeParams = (runId: string) => ({ params: Promise.resolve({ runId }) });

describe("GET /api/runs/[runId]", () => {
  it("returns run from run_state", async () => {
    mockQueryAll
      .mockResolvedValueOnce([
        {
          messages_json: "[]",
          current_phase: 2,
          phase_statuses_json:
            '{"1":"completed","2":"active","3":"locked","4":"locked","5":"locked","6":"locked","7":"locked"}',
          project_path: "/projects/my-app",
          project_name: "my-app",
        },
      ] as never)
      .mockResolvedValueOnce([] as never); // sessions

    const response = await GET(new Request("http://localhost"), makeParams("run-1"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.runId).toBe("run-1");
    expect(data.currentPhase).toBe(2);
    expect(data.projectName).toBe("my-app");
  });

  it("derives state from sessions when no run_state", async () => {
    mockQueryAll
      .mockResolvedValueOnce([] as never) // no run_state
      .mockResolvedValueOnce([
        {
          id: "s1",
          session_type: "analyze-project",
          status: "done",
          project_path: "/projects/test",
          created_at: "2024-01-01",
        },
      ] as never);

    const response = await GET(new Request("http://localhost"), makeParams("run-1"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.projectName).toBe("test");
  });

  it("returns 404 when run not found", async () => {
    mockQueryAll.mockResolvedValue([] as never);

    const response = await GET(new Request("http://localhost"), makeParams("nonexistent"));
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toContain("Run not found");
  });
});

describe("DELETE /api/runs/[runId]", () => {
  it("deletes run and related data", async () => {
    mockExecute.mockResolvedValue(undefined as never);

    const response = await DELETE(new Request("http://localhost"), makeParams("run-1"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(mockExecute).toHaveBeenCalledTimes(3); // logs, sessions, run_state
  });

  it("returns 500 on error", async () => {
    mockExecute.mockRejectedValue(new Error("DB error"));

    const response = await DELETE(new Request("http://localhost"), makeParams("run-1"));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBeDefined();
  });
});
