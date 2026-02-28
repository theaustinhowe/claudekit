import { cast } from "@claudekit/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/actions/sessions", () => ({
  listSessions: vi.fn(),
}));
vi.mock("@/lib/services/session-manager", () => ({
  createSession: vi.fn(),
  startSession: vi.fn(),
}));
vi.mock("@/lib/services/session-runners", () => ({
  sessionRunners: {
    scan: vi.fn(() => vi.fn()),
    chat: vi.fn(() => vi.fn()),
  },
}));

import { NextRequest } from "next/server";
import { listSessions } from "@/lib/actions/sessions";
import { createSession, startSession } from "@/lib/services/session-manager";
import { GET, POST } from "./route";

const mockListSessions = vi.mocked(listSessions);
const mockCreateSession = vi.mocked(createSession);
const mockStartSession = vi.mocked(startSession);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/sessions", () => {
  it("returns sessions list", async () => {
    mockListSessions.mockResolvedValue(cast([{ id: "s1", session_type: "scan", status: "done" }]));

    const req = new NextRequest("http://localhost/api/sessions");
    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveLength(1);
  });

  it("passes filter params", async () => {
    mockListSessions.mockResolvedValue(cast([]));

    const req = new NextRequest("http://localhost/api/sessions?status=running,pending&contextId=r1&limit=5");
    await GET(req);

    expect(mockListSessions).toHaveBeenCalledWith(
      expect.objectContaining({
        status: ["running", "pending"],
        contextId: "r1",
        limit: 5,
      }),
    );
  });
});

describe("POST /api/sessions", () => {
  it("creates and starts a session", async () => {
    mockCreateSession.mockResolvedValue(cast("sess-1"));
    mockStartSession.mockResolvedValue(cast(undefined));

    const req = new NextRequest("http://localhost/api/sessions", {
      method: "POST",
      body: JSON.stringify({ type: "scan", label: "Scan repos" }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.sessionId).toBe("sess-1");
  });

  it("returns 400 when type missing", async () => {
    const req = new NextRequest("http://localhost/api/sessions", {
      method: "POST",
      body: JSON.stringify({ label: "Missing type" }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("required");
  });

  it("returns 400 for unknown session type", async () => {
    const req = new NextRequest("http://localhost/api/sessions", {
      method: "POST",
      body: JSON.stringify({ type: "unknown-type", label: "Bad type" }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("Unknown session type");
  });
});
