import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/claude/runners/generate-scripts", () => ({
  createGenerateScriptsRunner: vi.fn(() => vi.fn()),
}));
vi.mock("@/lib/claude/session-manager", () => ({
  createSession: vi.fn(),
  startSession: vi.fn(),
}));

import { POST } from "@/app/api/analyze/scripts/route";
import { createSession } from "@/lib/claude/session-manager";

const mockCreateSession = vi.mocked(createSession);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/analyze/scripts", () => {
  it("creates and starts a generate-scripts session", async () => {
    mockCreateSession.mockResolvedValue("session-scripts");

    const req = new Request("http://localhost/api/analyze/scripts", {
      method: "POST",
      body: JSON.stringify({ runId: "run-1" }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.sessionId).toBe("session-scripts");
    expect(mockCreateSession).toHaveBeenCalledWith(expect.objectContaining({ sessionType: "generate-scripts" }));
  });
});
