import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
  execute: vi.fn(),
}));

import { cast } from "@claudekit/test-utils";
import { POST, PUT } from "@/app/api/runs/[runId]/state/route";
import { execute } from "@/lib/db";

const mockExecute = vi.mocked(execute);

beforeEach(() => {
  vi.clearAllMocks();
});

const makeParams = (runId: string) => ({ params: Promise.resolve({ runId }) });

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/runs/run-1/state", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PUT /api/runs/[runId]/state", () => {
  it("saves run state", async () => {
    mockExecute.mockResolvedValue(cast(undefined));

    const response = await PUT(
      makeRequest({
        messages: [{ role: "user", content: "hello" }],
        currentPhase: "2",
        phaseStatuses: { 1: "completed", 2: "active" },
        projectPath: "/project",
        projectName: "my-app",
      }),
      makeParams("run-1"),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("INSERT INTO run_state"),
      expect.arrayContaining(["run-1"]),
    );
  });

  it("returns 400 for missing required fields", async () => {
    const response = await PUT(makeRequest({ messages: [] }), makeParams("run-1"));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("required");
  });
});

describe("POST /api/runs/[runId]/state", () => {
  it("saves run state (same as PUT)", async () => {
    mockExecute.mockResolvedValue(cast(undefined));

    const response = await POST(
      makeRequest({
        messages: [],
        currentPhase: "1",
        phaseStatuses: { 1: "active" },
      }),
      makeParams("run-1"),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
  });
});
