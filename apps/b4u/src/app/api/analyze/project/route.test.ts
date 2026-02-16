import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/claude/runners/analyze-project", () => ({
  createAnalyzeProjectRunner: vi.fn(() => vi.fn()),
}));
vi.mock("@/lib/claude/session-manager", () => ({
  createSession: vi.fn(),
  startSession: vi.fn(),
}));

import { POST } from "@/app/api/analyze/project/route";
import { createSession, startSession } from "@/lib/claude/session-manager";

const mockCreateSession = vi.mocked(createSession);
const mockStartSession = vi.mocked(startSession);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/analyze/project", () => {
  it("creates and starts an analyze-project session", async () => {
    mockCreateSession.mockResolvedValue("session-123");
    mockStartSession.mockResolvedValue(undefined);

    const req = new Request("http://localhost/api/analyze/project", {
      method: "POST",
      body: JSON.stringify({ path: "/projects/my-app", runId: "run-1" }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.sessionId).toBe("session-123");
    expect(mockCreateSession).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionType: "analyze-project",
        projectPath: "/projects/my-app",
        runId: "run-1",
      }),
    );
  });

  it("returns 400 when path is missing", async () => {
    const req = new Request("http://localhost/api/analyze/project", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("path is required");
  });
});
