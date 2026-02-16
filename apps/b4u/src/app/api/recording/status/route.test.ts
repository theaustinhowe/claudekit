import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/claude/session-manager", () => ({
  getLiveSession: vi.fn(),
  getRecoverableSessions: vi.fn(),
}));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/recording/status/route";
import { getLiveSession, getRecoverableSessions } from "@/lib/claude/session-manager";

const mockGetLiveSession = vi.mocked(getLiveSession);
const mockGetRecoverableSessions = vi.mocked(getRecoverableSessions);

beforeEach(() => {
  vi.clearAllMocks();
  mockGetRecoverableSessions.mockResolvedValue([]);
});

describe("GET /api/recording/status", () => {
  it("returns session status when sessionId provided", async () => {
    mockGetLiveSession.mockReturnValue({
      id: "sess-1",
      status: "running",
      events: [{ type: "progress", data: "Recording..." }],
    } as never);

    const req = new NextRequest("http://localhost/api/recording/status?sessionId=sess-1");
    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.id).toBe("sess-1");
    expect(data.status).toBe("running");
  });

  it("returns recoverable sessions when no params provided", async () => {
    mockGetRecoverableSessions.mockResolvedValue([
      {
        id: "sess-2",
        sessionType: "recording",
        status: "error",
        label: "Test recording",
        runId: "run-1",
        createdAt: "2026-01-01T00:00:00Z",
      },
    ] as never);

    const req = new NextRequest("http://localhost/api/recording/status");
    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.sessions).toHaveLength(1);
    expect(data.sessions[0].id).toBe("sess-2");
    expect(data.hasRecoverable).toBe(true);
  });

  it("returns 404 when session not found", async () => {
    mockGetLiveSession.mockReturnValue(undefined as never);

    const req = new NextRequest("http://localhost/api/recording/status?sessionId=nonexistent");
    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toContain("Session not found");
  });
});
