import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/audio/elevenlabs-client", () => ({
  generateSpeech: vi.fn(),
  getDefaultVoiceId: vi.fn(),
}));

vi.mock("@/lib/video/ffmpeg-merger", () => ({
  concatenateAudioFiles: vi.fn().mockResolvedValue(undefined),
  generateSilence: vi.fn().mockResolvedValue(undefined),
}));

import { mkdir, unlink, writeFile } from "node:fs/promises";
import { generateSpeech, getDefaultVoiceId } from "@/lib/audio/elevenlabs-client";
import { generateFlowVoiceover } from "@/lib/audio/voiceover-generator";
import { concatenateAudioFiles, generateSilence } from "@/lib/video/ffmpeg-merger";

const mockGenerateSpeech = vi.mocked(generateSpeech);
const mockGetDefaultVoiceId = vi.mocked(getDefaultVoiceId);
const mockMkdir = vi.mocked(mkdir);
const mockWriteFile = vi.mocked(writeFile);
const mockUnlink = vi.mocked(unlink);
const mockConcatenateAudioFiles = vi.mocked(concatenateAudioFiles);
const mockGenerateSilence = vi.mocked(generateSilence);

beforeEach(() => {
  vi.clearAllMocks();
  mockGenerateSpeech.mockResolvedValue(Buffer.from("audio-data"));
  mockGetDefaultVoiceId.mockImplementation(async (name) => name);
});

describe("generateFlowVoiceover", () => {
  it("creates output and tmp directories", async () => {
    await generateFlowVoiceover({
      flowId: "onboarding",
      paragraphs: ["Hello"],
      voiceId: "v1",
    });

    expect(mockMkdir).toHaveBeenCalledTimes(2);
    expect(mockMkdir).toHaveBeenCalledWith(expect.any(String), { recursive: true });
  });

  it("calls generateSpeech for each paragraph", async () => {
    await generateFlowVoiceover({
      flowId: "onboarding",
      paragraphs: ["Paragraph 1", "Paragraph 2", "Paragraph 3"],
      voiceId: "v1",
    });

    expect(mockGenerateSpeech).toHaveBeenCalledTimes(3);
    expect(mockGenerateSpeech).toHaveBeenCalledWith("Paragraph 1", "v1", { speed: 1.0 });
    expect(mockGenerateSpeech).toHaveBeenCalledWith("Paragraph 2", "v1", { speed: 1.0 });
    expect(mockGenerateSpeech).toHaveBeenCalledWith("Paragraph 3", "v1", { speed: 1.0 });
  });

  it("passes custom speed setting", async () => {
    await generateFlowVoiceover({
      flowId: "onboarding",
      paragraphs: ["Hello"],
      voiceId: "v1",
      speed: 1.5,
    });

    expect(mockGenerateSpeech).toHaveBeenCalledWith("Hello", "v1", { speed: 1.5 });
  });

  it("writes each paragraph segment to a temp file", async () => {
    await generateFlowVoiceover({
      flowId: "test-flow",
      paragraphs: ["Hello", "World"],
      voiceId: "v1",
    });

    // One writeFile call per paragraph segment
    expect(mockWriteFile).toHaveBeenCalledTimes(2);
    expect(mockWriteFile).toHaveBeenCalledWith(expect.stringContaining("test-flow-p0.mp3"), expect.any(Buffer));
    expect(mockWriteFile).toHaveBeenCalledWith(expect.stringContaining("test-flow-p1.mp3"), expect.any(Buffer));
  });

  it("generates silence between paragraphs", async () => {
    await generateFlowVoiceover({
      flowId: "test-flow",
      paragraphs: ["Hello", "World", "Bye"],
      voiceId: "v1",
    });

    // Silence between paragraph 0-1 and 1-2
    expect(mockGenerateSilence).toHaveBeenCalledTimes(2);
    expect(mockGenerateSilence).toHaveBeenCalledWith(expect.stringContaining("test-flow-silence0.mp3"), 0.5);
    expect(mockGenerateSilence).toHaveBeenCalledWith(expect.stringContaining("test-flow-silence1.mp3"), 0.5);
  });

  it("concatenates all segments into final output file", async () => {
    await generateFlowVoiceover({
      flowId: "test-flow",
      paragraphs: ["Hello", "World"],
      voiceId: "v1",
    });

    expect(mockConcatenateAudioFiles).toHaveBeenCalledTimes(1);
    expect(mockConcatenateAudioFiles).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.stringContaining("test-flow-p0.mp3"),
        expect.stringContaining("test-flow-silence0.mp3"),
        expect.stringContaining("test-flow-p1.mp3"),
      ]),
      expect.stringContaining("test-flow.mp3"),
    );
  });

  it("cleans up temp segment files after concatenation", async () => {
    await generateFlowVoiceover({
      flowId: "test-flow",
      paragraphs: ["Hello", "World"],
      voiceId: "v1",
    });

    // 2 audio segments + 1 silence = 3 unlink calls
    expect(mockUnlink).toHaveBeenCalledTimes(3);
  });

  it("returns result with flowId, filePath, and durationEstimate", async () => {
    const result = await generateFlowVoiceover({
      flowId: "onboarding",
      paragraphs: ["This is a test paragraph with several words in it"],
      voiceId: "v1",
    });

    expect(result.flowId).toBe("onboarding");
    expect(result.filePath).toContain("onboarding.mp3");
    expect(result.durationEstimate).toBeGreaterThan(0);
  });

  it("estimates duration based on word count and speed", async () => {
    const words50 = Array.from({ length: 50 }, () => "word").join(" ");
    const result = await generateFlowVoiceover({
      flowId: "test",
      paragraphs: [words50],
      voiceId: "v1",
      speed: 1.0,
    });

    const expectedDuration = (50 / 150) * 60;
    expect(result.durationEstimate).toBeCloseTo(expectedDuration, 1);
  });

  it("adjusts duration estimate for speed", async () => {
    const words = Array.from({ length: 150 }, () => "word").join(" ");
    const result1x = await generateFlowVoiceover({
      flowId: "t1",
      paragraphs: [words],
      voiceId: "v1",
      speed: 1.0,
    });
    const result2x = await generateFlowVoiceover({
      flowId: "t2",
      paragraphs: [words],
      voiceId: "v1",
      speed: 2.0,
    });

    expect(result2x.durationEstimate).toBeCloseTo(result1x.durationEstimate / 2, 1);
  });

  it("calls onProgress callback for each paragraph", async () => {
    const onProgress = vi.fn();
    await generateFlowVoiceover({
      flowId: "onboarding",
      paragraphs: ["P1", "P2"],
      voiceId: "v1",
      onProgress,
    });

    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenCalledWith("Generating paragraph 1/2", 50);
    expect(onProgress).toHaveBeenCalledWith("Generating paragraph 2/2", 100);
  });

  it("uses custom output directory", async () => {
    await generateFlowVoiceover({
      flowId: "test",
      paragraphs: ["Hello"],
      voiceId: "v1",
      outputDir: "/custom/output",
    });

    expect(mockMkdir).toHaveBeenCalledWith("/custom/output", { recursive: true });
    expect(mockMkdir).toHaveBeenCalledWith("/custom/output/tmp", { recursive: true });
    expect(mockConcatenateAudioFiles).toHaveBeenCalledWith(expect.any(Array), "/custom/output/test.mp3");
  });

  it("resolves voice ID via getDefaultVoiceId", async () => {
    mockGetDefaultVoiceId.mockResolvedValue("resolved-voice-id");

    await generateFlowVoiceover({
      flowId: "test",
      paragraphs: ["Hello"],
      voiceId: "friendly-name",
    });

    expect(mockGetDefaultVoiceId).toHaveBeenCalledWith("friendly-name");
    expect(mockGenerateSpeech).toHaveBeenCalledWith("Hello", "resolved-voice-id", { speed: 1.0 });
  });
});
