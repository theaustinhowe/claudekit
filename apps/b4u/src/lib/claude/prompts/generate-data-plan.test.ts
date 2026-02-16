import { describe, expect, it } from "vitest";
import { buildGenerateDataPlanPrompt } from "@/lib/claude/prompts/generate-data-plan";

const baseContext = {
  name: "TestApp",
  framework: "Next.js 14",
  auth: "NextAuth",
  database: "Prisma + PostgreSQL",
  routes: [
    { path: "/dashboard", title: "Dashboard" },
    { path: "/settings", title: "Settings" },
  ],
  flows: [{ id: "daily-review", name: "Daily Review", steps: ["/dashboard", "/settings"] }],
};

describe("buildGenerateDataPlanPrompt", () => {
  it("includes the project name", () => {
    const prompt = buildGenerateDataPlanPrompt(baseContext);
    expect(prompt).toContain("TestApp");
  });

  it("includes framework info", () => {
    const prompt = buildGenerateDataPlanPrompt(baseContext);
    expect(prompt).toContain("Next.js 14");
  });

  it("includes auth info", () => {
    const prompt = buildGenerateDataPlanPrompt(baseContext);
    expect(prompt).toContain("NextAuth");
  });

  it("includes database info", () => {
    const prompt = buildGenerateDataPlanPrompt(baseContext);
    expect(prompt).toContain("Prisma + PostgreSQL");
  });

  it("includes route paths", () => {
    const prompt = buildGenerateDataPlanPrompt(baseContext);
    expect(prompt).toContain("/dashboard");
    expect(prompt).toContain("/settings");
  });

  it("includes flow information", () => {
    const prompt = buildGenerateDataPlanPrompt(baseContext);
    expect(prompt).toContain("Daily Review");
  });

  it("specifies expected JSON output structure", () => {
    const prompt = buildGenerateDataPlanPrompt(baseContext);
    expect(prompt).toContain('"entities"');
    expect(prompt).toContain('"authOverrides"');
    expect(prompt).toContain('"envItems"');
  });

  it("includes entity fields in example", () => {
    const prompt = buildGenerateDataPlanPrompt(baseContext);
    expect(prompt).toContain('"name"');
    expect(prompt).toContain('"count"');
    expect(prompt).toContain('"note"');
  });

  it("specifies guideline ranges", () => {
    const prompt = buildGenerateDataPlanPrompt(baseContext);
    expect(prompt).toContain("3-6 auth overrides");
    expect(prompt).toContain("3-6 env items");
    expect(prompt).toContain("4-8 entities");
  });

  it("requests JSON-only output", () => {
    const prompt = buildGenerateDataPlanPrompt(baseContext);
    expect(prompt).toContain("Return ONLY the JSON object");
  });
});
