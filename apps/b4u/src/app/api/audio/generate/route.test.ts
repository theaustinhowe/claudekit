import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/claude/runners/voiceover-audio", () => ({
  createVoiceoverAudioRunner: vi.fn(() => vi.fn()),
}));
vi.mock("@/lib/claude/session-manager", () => ({
  createSession: vi.fn(),
  startSession: vi.fn(),
}));

import { POST } from "@/app/api/audio/generate/route";
import { createSession } from "@/lib/claude/session-manager";

const mockCreateSession = vi.mocked(createSession);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/audio/generate", () => {
  it("creates a voiceover-audio session", async () => {
    mockCreateSession.mockResolvedValue("session-audio");

    const req = new Request("http://localhost/api/audio/generate", {
      method: "POST",
      body: JSON.stringify({ voiceId: "voice-1", speed: 1.2, runId: "run-1" }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.sessionId).toBe("session-audio");
  });

  it("returns 400 when voiceId is missing", async () => {
    const req = new Request("http://localhost/api/audio/generate", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("voiceId is required");
  });
});
