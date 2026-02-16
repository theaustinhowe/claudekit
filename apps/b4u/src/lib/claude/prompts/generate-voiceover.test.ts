import { describe, expect, it } from "vitest";
import { buildGenerateVoiceoverPrompt } from "./generate-voiceover";

describe("buildGenerateVoiceoverPrompt", () => {
  const scripts = [
    {
      flowId: "flow-1",
      flowName: "Login Flow",
      steps: [
        { action: "Click login", expectedOutcome: "Login form shows", duration: "3s" },
        { action: "Fill credentials", expectedOutcome: "Fields filled", duration: "5s" },
      ],
    },
  ];

  it("includes flow data in prompt", () => {
    const prompt = buildGenerateVoiceoverPrompt(scripts);

    expect(prompt).toContain("flow-1");
    expect(prompt).toContain("Login Flow");
    expect(prompt).toContain("Click login");
  });

  it("describes expected JSON output structure", () => {
    const prompt = buildGenerateVoiceoverPrompt(scripts);

    expect(prompt).toContain("voiceovers");
    expect(prompt).toContain("timelineMarkers");
    expect(prompt).toContain("paragraphIndex");
  });

  it("includes tone and formatting guidelines", () => {
    const prompt = buildGenerateVoiceoverPrompt(scripts);

    expect(prompt).toContain("Professional but friendly");
    expect(prompt).toContain("2-4 paragraphs per flow");
    expect(prompt).toContain("Return ONLY the JSON");
  });

  it("returns a string", () => {
    const prompt = buildGenerateVoiceoverPrompt([]);
    expect(typeof prompt).toBe("string");
  });
});
