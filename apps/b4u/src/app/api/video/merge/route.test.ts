import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/claude/runners/final-merge", () => ({
  createFinalMergeRunner: vi.fn(() => vi.fn()),
}));
vi.mock("@/lib/claude/session-manager", () => ({
  createSession: vi.fn(),
  startSession: vi.fn(),
}));

import { POST } from "@/app/api/video/merge/route";
import { createSession } from "@/lib/claude/session-manager";

const mockCreateSession = vi.mocked(createSession);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/video/merge", () => {
  it("creates a final-merge session", async () => {
    mockCreateSession.mockResolvedValue("session-merge");

    const req = new Request("http://localhost/api/video/merge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId: "run-1" }),
    });
    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.sessionId).toBe("session-merge");
    expect(mockCreateSession).toHaveBeenCalledWith(expect.objectContaining({ sessionType: "final-merge" }));
  });
});
