import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/claude/session-manager", () => ({
  getLiveSession: vi.fn(),
}));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/recording/status/route";
import { getLiveSession } from "@/lib/claude/session-manager";

const mockGetLiveSession = vi.mocked(getLiveSession);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/recording/status", () => {
  it("returns session status", async () => {
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

  it("returns 400 when sessionId missing", async () => {
    const req = new NextRequest("http://localhost/api/recording/status");
    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("sessionId required");
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
