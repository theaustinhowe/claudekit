import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
  queryAll: vi.fn(),
}));

import { cast } from "@claudekit/test-utils";
import { GET } from "@/app/api/sessions/history/route";
import { queryAll } from "@/lib/db";

const mockQueryAll = vi.mocked(queryAll);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/sessions/history", () => {
  it("returns grouped run entries", async () => {
    mockQueryAll.mockResolvedValue(
      cast([
        {
          id: "s1",
          session_type: "analyze-project",
          status: "done",
          label: "Analyze",
          context_name: "/projects/my-app",
          context_id: "run-1",
          started_at: "2024-01-01T00:00:00Z",
          completed_at: "2024-01-01T00:01:00Z",
          created_at: "2024-01-01T00:00:00Z",
          error_message: null,
        },
        {
          id: "s2",
          session_type: "generate-outline",
          status: "done",
          label: "Outline",
          context_name: "/projects/my-app",
          context_id: "run-1",
          started_at: "2024-01-01T00:01:00Z",
          completed_at: "2024-01-01T00:02:00Z",
          created_at: "2024-01-01T00:01:00Z",
          error_message: null,
        },
      ]),
    );

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.runs).toHaveLength(1);
    expect(data.runs[0].runId).toBe("run-1");
    expect(data.runs[0].sessionCount).toBe(2);
    expect(data.runs[0].projectName).toBe("my-app");
    expect(data.runs[0].hasError).toBe(false);
  });

  it("detects error in runs", async () => {
    mockQueryAll.mockResolvedValue(
      cast([
        {
          id: "s1",
          session_type: "analyze-project",
          status: "error",
          label: "Analyze",
          context_name: "/projects/fail",
          context_id: "run-2",
          started_at: "2024-01-01T00:00:00Z",
          completed_at: null,
          created_at: "2024-01-01T00:00:00Z",
          error_message: "Claude crashed",
        },
      ]),
    );

    const response = await GET();
    const data = await response.json();

    expect(data.runs[0].hasError).toBe(true);
    expect(data.runs[0].errorMessage).toBe("Claude crashed");
  });

  it("returns 500 on database error", async () => {
    mockQueryAll.mockRejectedValue(new Error("DB error"));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBeDefined();
  });
});
