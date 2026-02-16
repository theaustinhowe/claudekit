import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(async () => ({})),
  queryAll: vi.fn(),
  execute: vi.fn(),
}));
vi.mock("@/lib/audio/voiceover-generator", () => ({
  generateFlowVoiceover: vi.fn(),
}));

import { generateFlowVoiceover } from "@/lib/audio/voiceover-generator";
import { execute, queryAll } from "@/lib/db";
import { createVoiceoverAudioRunner } from "./voiceover-audio";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createVoiceoverAudioRunner", () => {
  const makeCtx = () => ({
    onProgress: vi.fn(),
    signal: new AbortController().signal,
    sessionId: "s1",
  });

  it("generates audio for each flow and saves to DB", async () => {
    vi.mocked(queryAll).mockResolvedValue([
      { flow_id: "f1", paragraph_index: 0, text: "Hello" },
      { flow_id: "f1", paragraph_index: 1, text: "World" },
      { flow_id: "f2", paragraph_index: 0, text: "Another flow" },
    ]);
    vi.mocked(generateFlowVoiceover)
      .mockResolvedValueOnce({ flowId: "f1", filePath: "/audio/f1.mp3", durationEstimate: 10 })
      .mockResolvedValueOnce({ flowId: "f2", filePath: "/audio/f2.mp3", durationEstimate: 5 });

    const runner = createVoiceoverAudioRunner("voice-1", 1.0);
    const result = await runner(makeCtx());

    expect(generateFlowVoiceover).toHaveBeenCalledTimes(2);
    expect(generateFlowVoiceover).toHaveBeenCalledWith(
      expect.objectContaining({ flowId: "f1", paragraphs: ["Hello", "World"], voiceId: "voice-1" }),
    );
    expect(execute).toHaveBeenCalledWith(expect.anything(), "DELETE FROM audio_files");
    expect(result).toEqual({
      result: {
        audioFiles: [
          { flowId: "f1", filePath: "/audio/f1.mp3", duration: 10 },
          { flowId: "f2", filePath: "/audio/f2.mp3", duration: 5 },
        ],
      },
    });
  });

  it("throws when aborted mid-generation", async () => {
    vi.mocked(queryAll).mockResolvedValue([{ flow_id: "f1", paragraph_index: 0, text: "Hello" }]);

    const controller = new AbortController();
    // Abort after first generateFlowVoiceover call
    vi.mocked(generateFlowVoiceover).mockImplementation(async () => {
      controller.abort();
      return { flowId: "f1", filePath: "/audio/f1.mp3", durationEstimate: 5 };
    });

    const _runner = createVoiceoverAudioRunner("voice-1");
    // With a single flow, the abort check happens at the top of the loop for the next iteration,
    // but since there's only one flow, the loop ends. Let's use two flows.
    vi.mocked(queryAll).mockResolvedValue([
      { flow_id: "f1", paragraph_index: 0, text: "Hello" },
      { flow_id: "f2", paragraph_index: 0, text: "World" },
    ]);

    const runner2 = createVoiceoverAudioRunner("voice-1");

    await expect(runner2({ onProgress: vi.fn(), signal: controller.signal, sessionId: "s1" })).rejects.toThrow(
      "Aborted",
    );
  });
});
