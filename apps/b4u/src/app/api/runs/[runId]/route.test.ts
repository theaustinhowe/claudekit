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
          context_name: "/projects/test",
          created_at: "2024-01-01",
        },
      ] as never);

    const response = await GET(new Request("http://localhost"), makeParams("run-1"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.projectName).toBe("test");
  });

  it("returns messages from run_state when they exist", async () => {
    const storedMessages = [
      { id: "m1", role: "user", content: "Hello", timestamp: 1000 },
      { id: "m2", role: "ai", content: "Hi!", timestamp: 1001 },
    ];
    mockQueryAll
      .mockResolvedValueOnce([
        {
          messages_json: JSON.stringify(storedMessages),
          current_phase: 2,
          phase_statuses_json:
            '{"1":"completed","2":"active","3":"locked","4":"locked","5":"locked","6":"locked","7":"locked"}',
          project_path: "/projects/my-app",
          project_name: "my-app",
        },
      ] as never)
      .mockResolvedValueOnce([] as never);

    const response = await GET(new Request("http://localhost"), makeParams("run-1"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.messages).toEqual(storedMessages);
    expect(data.messages).toHaveLength(2);
  });

  it("returns system message for legacy fallback (no run_state)", async () => {
    mockQueryAll
      .mockResolvedValueOnce([] as never) // no run_state
      .mockResolvedValueOnce([
        {
          id: "s1",
          session_type: "analyze-project",
          status: "done",
          context_name: "/projects/test",
          created_at: "2024-01-01",
        },
      ] as never);

    const response = await GET(new Request("http://localhost"), makeParams("run-1"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.messages).toHaveLength(1);
    expect(data.messages[0].role).toBe("system");
    expect(data.messages[0].content).toContain("Restored run");
    expect(data.messages[0].content).toContain("test");
    expect(data.messages[0].id).toBe("restored-run-1");
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
    // 8 content tables + session_logs + sessions + run_state = 11
    expect(mockExecute).toHaveBeenCalledTimes(11);
  });

  it("returns 500 on error", async () => {
    mockExecute.mockRejectedValue(new Error("DB error"));

    const response = await DELETE(new Request("http://localhost"), makeParams("run-1"));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBeDefined();
  });
});
