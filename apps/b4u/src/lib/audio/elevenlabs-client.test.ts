import { cast } from "@claudekit/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateSpeech, listVoices, previewVoice } from "@/lib/audio/elevenlabs-client";

const originalFetch = globalThis.fetch;
const originalEnv = process.env.ELEVENLABS_API_KEY;

beforeEach(() => {
  process.env.ELEVENLABS_API_KEY = "test-api-key";
  globalThis.fetch = vi.fn();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalEnv !== undefined) {
    process.env.ELEVENLABS_API_KEY = originalEnv;
  } else {
    delete process.env.ELEVENLABS_API_KEY;
  }
});

const mockFetch = () => vi.mocked(globalThis.fetch);

describe("listVoices", () => {
  it("fetches voices from the API", async () => {
    const voices = [{ voice_id: "v1", name: "Alice", category: "premade", labels: {}, preview_url: "" }];
    mockFetch().mockResolvedValue({
      ok: true,
      json: async () => ({ voices }),
    } as Response);

    const result = await listVoices();
    expect(result).toEqual(voices);
    expect(mockFetch()).toHaveBeenCalledWith("https://api.elevenlabs.io/v1/voices", {
      headers: { "xi-api-key": "test-api-key" },
    });
  });

  it("returns empty array when voices field is missing", async () => {
    mockFetch().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);

    const result = await listVoices();
    expect(result).toEqual([]);
  });

  it("throws when API returns error", async () => {
    mockFetch().mockResolvedValue({
      ok: false,
      status: 401,
    } as Response);

    await expect(listVoices()).rejects.toThrow("ElevenLabs API error: 401");
  });

  it("throws when API key is not set", async () => {
    delete process.env.ELEVENLABS_API_KEY;
    await expect(listVoices()).rejects.toThrow("ELEVENLABS_API_KEY not set");
  });
});

describe("generateSpeech", () => {
  it("sends correct request to TTS endpoint", async () => {
    const audioBuffer = new ArrayBuffer(8);
    mockFetch().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => audioBuffer,
    } as Response);

    const result = await generateSpeech("Hello world", "voice-123");
    expect(result).toBeInstanceOf(Buffer);
    expect(mockFetch()).toHaveBeenCalledWith(
      "https://api.elevenlabs.io/v1/text-to-speech/voice-123",
      expect.objectContaining({
        method: "POST",
        headers: {
          "xi-api-key": "test-api-key",
          "Content-Type": "application/json",
        },
      }),
    );
  });

  it("uses default voice settings", async () => {
    mockFetch().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(0),
    } as Response);

    await generateSpeech("text", "v1");
    const body = JSON.parse(
      (cast<unknown[]>(mockFetch().mock.calls[0])[1] as string | (() => { body: string }))
        ? String((cast<unknown[]>(mockFetch().mock.calls[0])[1] as { body: string }).body)
        : "",
    );
    expect(body.voice_settings.stability).toBe(0.5);
    expect(body.voice_settings.similarity_boost).toBe(0.75);
    expect(body.voice_settings.speed).toBe(1.0);
  });

  it("uses custom voice settings when provided", async () => {
    mockFetch().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(0),
    } as Response);

    await generateSpeech("text", "v1", { stability: 0.8, similarity_boost: 0.9, speed: 1.5 });
    const call = mockFetch().mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(call[1].body as string);
    expect(body.voice_settings.stability).toBe(0.8);
    expect(body.voice_settings.similarity_boost).toBe(0.9);
    expect(body.voice_settings.speed).toBe(1.5);
  });

  it("throws on API error with response body", async () => {
    mockFetch().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "Bad request body",
    } as Response);

    await expect(generateSpeech("text", "v1")).rejects.toThrow("ElevenLabs TTS error: 400 - Bad request body");
  });

  it("sends model_id in request body", async () => {
    mockFetch().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(0),
    } as Response);

    await generateSpeech("text", "v1");
    const call = mockFetch().mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(call[1].body as string);
    expect(body.model_id).toBe("eleven_monolingual_v1");
  });
});

describe("previewVoice", () => {
  it("truncates text to 200 characters for preview", async () => {
    mockFetch().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(0),
    } as Response);

    const longText = "a".repeat(500);
    await previewVoice(longText, "v1");

    const call = mockFetch().mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(call[1].body as string);
    expect(body.text).toHaveLength(200);
  });

  it("does not truncate short text", async () => {
    mockFetch().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(0),
    } as Response);

    await previewVoice("Hello", "v1");

    const call = mockFetch().mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(call[1].body as string);
    expect(body.text).toBe("Hello");
  });
});
