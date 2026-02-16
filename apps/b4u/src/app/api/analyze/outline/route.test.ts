import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/claude/runners/generate-outline", () => ({
  createGenerateOutlineRunner: vi.fn(() => vi.fn()),
}));
vi.mock("@/lib/claude/session-manager", () => ({
  createSession: vi.fn(),
  startSession: vi.fn(),
}));

import { POST } from "@/app/api/analyze/outline/route";
import { createSession } from "@/lib/claude/session-manager";

const mockCreateSession = vi.mocked(createSession);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/analyze/outline", () => {
  it("creates and starts a generate-outline session", async () => {
    mockCreateSession.mockResolvedValue("session-789");

    const req = new Request("http://localhost/api/analyze/outline", {
      method: "POST",
      body: JSON.stringify({ runId: "run-1" }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.sessionId).toBe("session-789");
    expect(mockCreateSession).toHaveBeenCalledWith(
      expect.objectContaining({ sessionType: "generate-outline", runId: "run-1" }),
    );
  });

  it("works without runId", async () => {
    mockCreateSession.mockResolvedValue("session-abc");

    const req = new Request("http://localhost/api/analyze/outline", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.sessionId).toBe("session-abc");
  });
});
