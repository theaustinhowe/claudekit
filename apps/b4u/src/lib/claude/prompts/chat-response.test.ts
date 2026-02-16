import { describe, expect, it } from "vitest";
import { buildChatResponsePrompt } from "@/lib/claude/prompts/chat-response";

describe("buildChatResponsePrompt", () => {
  it("includes correct phase label for phase 1", () => {
    const result = buildChatResponsePrompt("hello", 1, {});
    expect(result).toContain("Current phase: 1 — Project Selection");
  });

  it("includes correct phase label for phase 4", () => {
    const result = buildChatResponsePrompt("hello", 4, {});
    expect(result).toContain("Current phase: 4 — Demo Scripts");
  });

  it("formats array data as item counts", () => {
    const result = buildChatResponsePrompt("hello", 2, {
      routes: ["/home", "/about", "/settings"],
    });
    expect(result).toContain("routes: 3 items");
  });

  it("formats object data as truncated JSON", () => {
    const obj = { name: "MyApp", framework: "Next.js" };
    const result = buildChatResponsePrompt("hello", 2, {
      project: obj,
    });
    expect(result).toContain("project: ");
    expect(result).toContain('"name":"MyApp"');
    expect(result).toContain('"framework":"Next.js"');
  });

  it("formats scalar values as-is", () => {
    const result = buildChatResponsePrompt("hello", 3, {
      count: 42,
      label: "test",
      enabled: true,
    });
    expect(result).toContain("count: 42");
    expect(result).toContain("label: test");
    expect(result).toContain("enabled: true");
  });

  it("shows 'No data loaded yet' for empty phaseData", () => {
    const result = buildChatResponsePrompt("hello", 1, {});
    expect(result).toContain("No data loaded yet");
  });

  it("includes the user message in the output", () => {
    const result = buildChatResponsePrompt("How do I add a new route?", 4, {});
    expect(result).toContain('The user said: "How do I add a new route?"');
  });

  it("contains JSON format instructions", () => {
    const result = buildChatResponsePrompt("hello", 1, {});
    expect(result).toContain("Return valid JSON in this exact format:");
    expect(result).toContain('"response"');
    expect(result).toContain('"suggestedAction"');
  });
});
