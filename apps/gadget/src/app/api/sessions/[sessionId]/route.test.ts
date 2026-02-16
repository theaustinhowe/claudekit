import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/actions/sessions", () => ({
  getSessionRecord: vi.fn(),
  getSessionLogsFromDb: vi.fn(),
}));
vi.mock("@/lib/services/session-manager", () => ({
  getLiveSession: vi.fn(),
}));

import { getSessionLogsFromDb, getSessionRecord } from "@/lib/actions/sessions";
import { getLiveSession } from "@/lib/services/session-manager";
import { GET } from "./route";

const mockGetLiveSession = vi.mocked(getLiveSession);
const mockGetSessionRecord = vi.mocked(getSessionRecord);
const mockGetSessionLogsFromDb = vi.mocked(getSessionLogsFromDb);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/sessions/[sessionId]", () => {
  it("returns live session when available", async () => {
    mockGetLiveSession.mockReturnValue({
      id: "s1",
      sessionType: "scan",
      status: "running",
      label: "Scanning",
      events: [
        { log: "Starting scan", logType: "status" },
        { log: "Found 3 repos", logType: "status" },
      ],
    } as never);

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ sessionId: "s1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe("running");
    expect(data.recentLogs).toHaveLength(2);
  });

  it("falls back to DB when no live session", async () => {
    mockGetLiveSession.mockReturnValue(null as never);
    mockGetSessionRecord.mockResolvedValue({
      id: "s1",
      session_type: "scan",
      status: "done",
    } as never);
    mockGetSessionLogsFromDb.mockResolvedValue([{ log: "Complete", log_type: "status" }] as never);

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ sessionId: "s1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe("done");
    expect(data.recentLogs).toHaveLength(1);
  });

  it("returns 404 when session not found", async () => {
    mockGetLiveSession.mockReturnValue(null as never);
    mockGetSessionRecord.mockResolvedValue(undefined as never);

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ sessionId: "nonexistent" }),
    });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toContain("not found");
  });
});
