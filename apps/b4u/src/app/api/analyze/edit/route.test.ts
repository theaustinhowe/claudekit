import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/claude/runners/edit-content", () => ({
  createEditContentRunner: vi.fn(() => vi.fn()),
}));
vi.mock("@/lib/claude/session-manager", () => ({
  createSession: vi.fn(),
  startSession: vi.fn(),
}));

import { POST } from "@/app/api/analyze/edit/route";
import { createSession } from "@/lib/claude/session-manager";

const mockCreateSession = vi.mocked(createSession);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/analyze/edit", () => {
  it("creates an edit-content session", async () => {
    mockCreateSession.mockResolvedValue("session-456");

    const req = new Request("http://localhost/api/analyze/edit", {
      method: "POST",
      body: JSON.stringify({ phase: 2, editRequest: "Make it shorter", runId: "run-1" }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.sessionId).toBe("session-456");
    expect(mockCreateSession).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionType: "edit-content",
        metadata: { phase: 2, editRequest: "Make it shorter" },
      }),
    );
  });

  it("returns 400 for missing phase", async () => {
    const req = new Request("http://localhost/api/analyze/edit", {
      method: "POST",
      body: JSON.stringify({ editRequest: "test" }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("Missing or invalid");
  });

  it("returns 400 for missing editRequest", async () => {
    const req = new Request("http://localhost/api/analyze/edit", {
      method: "POST",
      body: JSON.stringify({ phase: 1 }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("Missing or invalid");
  });
});
