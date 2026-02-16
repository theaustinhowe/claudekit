import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/audio/elevenlabs-client", () => ({
  previewVoice: vi.fn(),
}));

import { POST } from "@/app/api/audio/preview/route";
import { previewVoice } from "@/lib/audio/elevenlabs-client";

const mockPreviewVoice = vi.mocked(previewVoice);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/audio/preview", () => {
  it("returns audio data", async () => {
    mockPreviewVoice.mockResolvedValue(Buffer.from("audio-data"));

    const req = new Request("http://localhost/api/audio/preview", {
      method: "POST",
      body: JSON.stringify({ text: "Hello world", voiceId: "voice-1" }),
    });

    const response = await POST(req);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("audio/mpeg");
  });

  it("returns 400 when text is missing", async () => {
    const req = new Request("http://localhost/api/audio/preview", {
      method: "POST",
      body: JSON.stringify({ voiceId: "voice-1" }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("text and voiceId required");
  });

  it("returns 500 on preview failure", async () => {
    mockPreviewVoice.mockRejectedValue(new Error("API error"));

    const req = new Request("http://localhost/api/audio/preview", {
      method: "POST",
      body: JSON.stringify({ text: "Hello", voiceId: "voice-1" }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain("API error");
  });
});
