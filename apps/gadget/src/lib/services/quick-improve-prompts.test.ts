import { describe, expect, it } from "vitest";

import { PERSONA_CONFIGS, type QuickImprovePersona } from "./quick-improve-prompts";

describe("quick-improve-prompts", () => {
  const personas: QuickImprovePersona[] = ["uiux", "dry-kiss", "security", "cleanup"];

  it("has all four personas", () => {
    expect(Object.keys(PERSONA_CONFIGS)).toEqual(expect.arrayContaining(personas));
    expect(Object.keys(PERSONA_CONFIGS)).toHaveLength(4);
  });

  for (const persona of personas) {
    describe(`persona: ${persona}`, () => {
      it("has required fields", () => {
        const config = PERSONA_CONFIGS[persona];

        expect(config.label).toBeTruthy();
        expect(config.branchPrefix).toBeTruthy();
        expect(config.commitMessage).toBeTruthy();
        expect(config.allowedTools).toBeTruthy();
        expect(typeof config.prTitle).toBe("function");
        expect(typeof config.prBody).toBe("function");
        expect(typeof config.buildPrompt).toBe("function");
      });

      it("prTitle returns a string", () => {
        const title = PERSONA_CONFIGS[persona].prTitle("my-repo");
        expect(typeof title).toBe("string");
        expect(title).toContain("my-repo");
      });

      it("prBody returns a string", () => {
        const body = PERSONA_CONFIGS[persona].prBody("my-repo", "some output");
        expect(typeof body).toBe("string");
        expect(body).toContain("my-repo");
      });

      it("buildPrompt includes environment context", () => {
        const prompt = PERSONA_CONFIGS[persona].buildPrompt("/path/to/repo");
        expect(prompt).toContain("/path/to/repo");
        expect(prompt).toContain("Environment");
      });
    });
  }
});
