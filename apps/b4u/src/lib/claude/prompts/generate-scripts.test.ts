import { describe, expect, it } from "vitest";
import { buildGenerateScriptsPrompt } from "@/lib/claude/prompts/generate-scripts";

const baseContext = {
  name: "TestApp",
  framework: "Next.js 14",
  flows: [
    { id: "onboarding", name: "Onboarding", steps: ["/register", "/onboarding", "/dashboard"] },
    { id: "billing", name: "Billing", steps: ["/settings", "/settings/billing"] },
  ],
  routes: [
    { path: "/register", title: "Register", description: "Account creation" },
    { path: "/onboarding", title: "Onboarding", description: "Setup wizard" },
    { path: "/dashboard", title: "Dashboard", description: "Main view" },
    { path: "/settings", title: "Settings", description: "User settings" },
    { path: "/settings/billing", title: "Billing", description: "Payment management" },
  ],
};

describe("buildGenerateScriptsPrompt", () => {
  it("includes the project name", () => {
    const prompt = buildGenerateScriptsPrompt(baseContext);
    expect(prompt).toContain("TestApp");
  });

  it("serializes available routes", () => {
    const prompt = buildGenerateScriptsPrompt(baseContext);
    expect(prompt).toContain("/register");
    expect(prompt).toContain("/settings/billing");
  });

  it("serializes user flows", () => {
    const prompt = buildGenerateScriptsPrompt(baseContext);
    expect(prompt).toContain("onboarding");
    expect(prompt).toContain("billing");
  });

  it("specifies expected JSON output with scripts array", () => {
    const prompt = buildGenerateScriptsPrompt(baseContext);
    expect(prompt).toContain('"scripts"');
    expect(prompt).toContain('"flowId"');
    expect(prompt).toContain('"flowName"');
    expect(prompt).toContain('"steps"');
  });

  it("includes step field descriptions", () => {
    const prompt = buildGenerateScriptsPrompt(baseContext);
    expect(prompt).toContain('"stepNumber"');
    expect(prompt).toContain('"url"');
    expect(prompt).toContain('"action"');
    expect(prompt).toContain('"expectedOutcome"');
    expect(prompt).toContain('"duration"');
  });

  it("mentions duration guidelines", () => {
    const prompt = buildGenerateScriptsPrompt(baseContext);
    expect(prompt).toContain("2s-5s");
  });

  it("mentions step count guideline", () => {
    const prompt = buildGenerateScriptsPrompt(baseContext);
    expect(prompt).toContain("4-8 steps per flow");
  });
});
