import { describe, expect, it } from "vitest";
import { buildAnalyzeProjectPrompt } from "@/lib/claude/prompts/analyze-project";

describe("buildAnalyzeProjectPrompt", () => {
  it("includes the project path in the prompt", () => {
    const prompt = buildAnalyzeProjectPrompt("/home/user/my-app");
    expect(prompt).toContain("/home/user/my-app");
  });

  it("mentions JSON output requirement", () => {
    const prompt = buildAnalyzeProjectPrompt("/project");
    expect(prompt).toContain("valid JSON");
  });

  it("references expected output fields", () => {
    const prompt = buildAnalyzeProjectPrompt("/project");
    expect(prompt).toContain('"name"');
    expect(prompt).toContain('"framework"');
    expect(prompt).toContain('"directories"');
    expect(prompt).toContain('"auth"');
    expect(prompt).toContain('"database"');
    expect(prompt).toContain('"routes"');
    expect(prompt).toContain('"summary"');
  });

  it("includes instructions for package.json analysis", () => {
    const prompt = buildAnalyzeProjectPrompt("/project");
    expect(prompt).toContain("package.json");
  });

  it("mentions routing patterns to glob for", () => {
    const prompt = buildAnalyzeProjectPrompt("/project");
    expect(prompt).toContain("page.tsx");
  });

  it("returns a non-empty string", () => {
    const prompt = buildAnalyzeProjectPrompt("/any/path");
    expect(prompt.length).toBeGreaterThan(100);
  });
});
