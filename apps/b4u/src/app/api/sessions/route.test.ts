import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/claude/session-manager", () => ({
  createSession: vi.fn(),
}));

import { POST } from "@/app/api/sessions/route";
import { createSession } from "@/lib/claude/session-manager";

const mockCreateSession = vi.mocked(createSession);

beforeEach(() => {
  vi.clearAllMocks();
});

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/sessions", () => {
  it("creates a session and returns the ID", async () => {
    mockCreateSession.mockResolvedValue("session-abc-123");

    const req = makeRequest({
      sessionType: "analyze-project",
      label: "Analyze my project",
      projectPath: "/home/user/project",
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.id).toBe("session-abc-123");
    expect(mockCreateSession).toHaveBeenCalledWith({
      sessionType: "analyze-project",
      label: "Analyze my project",
      projectPath: "/home/user/project",
    });
  });

  it("returns 400 when sessionType is missing", async () => {
    const req = makeRequest({ label: "No type" });
    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("sessionType and label required");
  });

  it("returns 400 when label is missing", async () => {
    const req = makeRequest({ sessionType: "analyze-project" });
    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("sessionType and label required");
  });

  it("returns 400 when both sessionType and label are missing", async () => {
    const req = makeRequest({});
    const response = await POST(req);
    expect(response.status).toBe(400);
  });

  it("passes projectPath to createSession", async () => {
    mockCreateSession.mockResolvedValue("session-xyz");

    const req = makeRequest({
      sessionType: "generate-outline",
      label: "Outline",
      projectPath: "/tmp/project",
    });

    await POST(req);

    expect(mockCreateSession).toHaveBeenCalledWith(expect.objectContaining({ projectPath: "/tmp/project" }));
  });
});
