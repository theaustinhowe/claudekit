import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/audio/elevenlabs-client", () => ({
  generateSpeech: vi.fn(),
}));

import { mkdir, writeFile } from "node:fs/promises";
import { generateSpeech } from "@/lib/audio/elevenlabs-client";
import { generateFlowVoiceover } from "@/lib/audio/voiceover-generator";

const mockGenerateSpeech = vi.mocked(generateSpeech);
const mockMkdir = vi.mocked(mkdir);
const mockWriteFile = vi.mocked(writeFile);

beforeEach(() => {
  vi.clearAllMocks();
  mockGenerateSpeech.mockResolvedValue(Buffer.from("audio-data"));
});

describe("generateFlowVoiceover", () => {
  it("creates output directory", async () => {
    await generateFlowVoiceover({
      flowId: "onboarding",
      paragraphs: ["Hello"],
      voiceId: "v1",
    });

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

  it("writes combined audio to file", async () => {
    await generateFlowVoiceover({
      flowId: "test-flow",
      paragraphs: ["Hello"],
      voiceId: "v1",
    });

    expect(mockWriteFile).toHaveBeenCalledWith(expect.stringContaining("test-flow.mp3"), expect.any(Buffer));
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
    expect(mockWriteFile).toHaveBeenCalledWith("/custom/output/test.mp3", expect.any(Buffer));
  });
});
