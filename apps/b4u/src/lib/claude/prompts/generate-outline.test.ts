import { describe, expect, it } from "vitest";
import { buildGenerateOutlinePrompt } from "@/lib/claude/prompts/generate-outline";

const baseContext = {
  name: "TestApp",
  framework: "Next.js 14 (App Router)",
  routes: [
    { path: "/", title: "Home", authRequired: false, description: "Landing page" },
    { path: "/dashboard", title: "Dashboard", authRequired: true, description: "Main dashboard" },
  ],
  auth: "NextAuth",
  database: "Prisma + PostgreSQL",
};

describe("buildGenerateOutlinePrompt", () => {
  it("includes the project name", () => {
    const prompt = buildGenerateOutlinePrompt(baseContext);
    expect(prompt).toContain("TestApp");
  });

  it("includes framework info", () => {
    const prompt = buildGenerateOutlinePrompt(baseContext);
    expect(prompt).toContain("Next.js 14 (App Router)");
  });

  it("includes auth info", () => {
    const prompt = buildGenerateOutlinePrompt(baseContext);
    expect(prompt).toContain("NextAuth");
  });

  it("includes database info", () => {
    const prompt = buildGenerateOutlinePrompt(baseContext);
    expect(prompt).toContain("Prisma + PostgreSQL");
  });

  it("serializes routes as JSON", () => {
    const prompt = buildGenerateOutlinePrompt(baseContext);
    expect(prompt).toContain("/dashboard");
    expect(prompt).toContain("Main dashboard");
  });

  it("specifies expected JSON output structure", () => {
    const prompt = buildGenerateOutlinePrompt(baseContext);
    expect(prompt).toContain('"routes"');
    expect(prompt).toContain('"flows"');
    expect(prompt).toContain('"id"');
    expect(prompt).toContain('"steps"');
  });

  it("includes guidelines for flow count", () => {
    const prompt = buildGenerateOutlinePrompt(baseContext);
    expect(prompt).toContain("3-6 user flows");
  });

  it("requests JSON-only output", () => {
    const prompt = buildGenerateOutlinePrompt(baseContext);
    expect(prompt).toContain("Return ONLY the JSON object");
  });
});
