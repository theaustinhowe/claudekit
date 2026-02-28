import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
  queryAll: vi.fn(),
  execute: vi.fn(),
}));

import { cast } from "@claudekit/test-utils";
import { DELETE, GET } from "@/app/api/runs/[runId]/route";
import { execute, queryAll } from "@/lib/db";

const mockQueryAll = vi.mocked(queryAll);
const mockExecute = vi.mocked(execute);

beforeEach(() => {
  vi.clearAllMocks();
});

const makeParams = (runId: string) => ({ params: Promise.resolve({ runId }) });

describe("GET /api/runs/[runId]", () => {
  it("returns run from run_state with legacy messages converted to thread", async () => {
    mockQueryAll
      .mockResolvedValueOnce(
        cast([
          {
            messages_json: "[]",
            current_phase: 2,
            phase_statuses_json:
              '{"1":"completed","2":"active","3":"locked","4":"locked","5":"locked","6":"locked","7":"locked"}',
            project_path: "/projects/my-app",
            project_name: "my-app",
            threads_json: null,
          },
        ]),
      )
      .mockResolvedValueOnce(cast([])) // phase_threads
      .mockResolvedValueOnce(cast([])); // sessions

    const response = await GET(new Request("http://localhost"), makeParams("run-1"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.runId).toBe("run-1");
    expect(data.currentPhase).toBe(2);
    expect(data.projectName).toBe("my-app");
    expect(data.threads).toBeDefined();
    expect(data.activeThreadIds).toBeDefined();
  });

  it("derives state from sessions when no run_state", async () => {
    mockQueryAll
      .mockResolvedValueOnce(cast([])) // no run_state
      .mockResolvedValueOnce(cast([])) // no phase_threads
      .mockResolvedValueOnce(
        cast([
          {
            id: "s1",
            session_type: "analyze-project",
            status: "done",
            context_name: "/projects/test",
            created_at: "2024-01-01",
          },
        ]),
      );

    const response = await GET(new Request("http://localhost"), makeParams("run-1"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.projectName).toBe("test");
    expect(data.threads).toBeDefined();
    expect(data.activeThreadIds).toBeDefined();
  });

  it("returns threads from phase_threads when they exist", async () => {
    mockQueryAll
      .mockResolvedValueOnce(
        cast([
          {
            messages_json: "[]",
            current_phase: 2,
            phase_statuses_json:
              '{"1":"completed","2":"active","3":"locked","4":"locked","5":"locked","6":"locked","7":"locked"}',
            project_path: "/projects/my-app",
            project_name: "my-app",
            threads_json: '{"1":"t-1","2":"t-2","3":null,"4":null,"5":null,"6":null,"7":null}',
          },
        ]),
      )
      .mockResolvedValueOnce(
        cast([
          {
            id: "t-1",
            run_id: "run-1",
            phase: 1,
            revision: 1,
            messages_json: '[{"id":"m1","role":"ai","content":"Hello","timestamp":1000}]',
            decisions_json: "[]",
            status: "completed",
            created_at: "2024-01-01T00:00:00Z",
          },
          {
            id: "t-2",
            run_id: "run-1",
            phase: 2,
            revision: 1,
            messages_json: "[]",
            decisions_json: "[]",
            status: "active",
            created_at: "2024-01-01T00:01:00Z",
          },
        ]),
      )
      .mockResolvedValueOnce(cast([])); // sessions

    const response = await GET(new Request("http://localhost"), makeParams("run-1"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.threads["1"]).toHaveLength(1);
    expect(data.threads["1"][0].messages).toHaveLength(1);
    expect(data.threads["2"]).toHaveLength(1);
    expect(data.activeThreadIds["1"]).toBe("t-1");
    expect(data.activeThreadIds["2"]).toBe("t-2");
  });

  it("returns system message for legacy fallback (no run_state)", async () => {
    mockQueryAll
      .mockResolvedValueOnce(cast([])) // no run_state
      .mockResolvedValueOnce(cast([])) // no phase_threads
      .mockResolvedValueOnce(
        cast([
          {
            id: "s1",
            session_type: "analyze-project",
            status: "done",
            context_name: "/projects/test",
            created_at: "2024-01-01",
          },
        ]),
      );

    const response = await GET(new Request("http://localhost"), makeParams("run-1"));
    const data = await response.json();

    expect(response.status).toBe(200);
    // Legacy messages are now in a synthetic thread
    const currentPhaseThreads = data.threads[String(data.currentPhase)];
    expect(currentPhaseThreads).toBeDefined();
    expect(currentPhaseThreads.length).toBe(1);
    const thread = currentPhaseThreads[0];
    expect(thread.messages).toHaveLength(1);
    expect(thread.messages[0].role).toBe("system");
    expect(thread.messages[0].content).toContain("Restored run");
  });

  it("returns 404 when run not found", async () => {
    mockQueryAll.mockResolvedValue(cast([]));

    const response = await GET(new Request("http://localhost"), makeParams("nonexistent"));
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toContain("Run not found");
  });
});

describe("DELETE /api/runs/[runId]", () => {
  it("deletes run and related data", async () => {
    mockExecute.mockResolvedValue(cast(undefined));

    const response = await DELETE(new Request("http://localhost"), makeParams("run-1"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    // 9 content tables (including phase_threads) + session_logs + sessions + run_state = 12
    expect(mockExecute).toHaveBeenCalledTimes(12);
  });

  it("returns 500 on error", async () => {
    mockExecute.mockRejectedValue(new Error("DB error"));

    const response = await DELETE(new Request("http://localhost"), makeParams("run-1"));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBeDefined();
  });
});
