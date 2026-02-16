import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/claude/runners/recording", () => ({
  createRecordingRunner: vi.fn(() => vi.fn()),
}));
vi.mock("@/lib/claude/session-manager", () => ({
  createSession: vi.fn(),
  startSession: vi.fn(),
}));

import { POST } from "@/app/api/recording/start/route";
import { createSession } from "@/lib/claude/session-manager";

const mockCreateSession = vi.mocked(createSession);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/recording/start", () => {
  it("creates a recording session", async () => {
    mockCreateSession.mockResolvedValue("session-rec");

    const req = new Request("http://localhost/api/recording/start", {
      method: "POST",
      body: JSON.stringify({ projectPath: "/projects/app", flowIds: ["flow-1", "flow-2"] }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.sessionId).toBe("session-rec");
    expect(mockCreateSession).toHaveBeenCalledWith(
      expect.objectContaining({ sessionType: "recording", projectPath: "/projects/app" }),
    );
  });

  it("returns 400 when projectPath is missing", async () => {
    const req = new Request("http://localhost/api/recording/start", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("projectPath is required");
  });
});
