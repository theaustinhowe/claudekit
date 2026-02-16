import { describe, expect, it } from "vitest";
import { KNOWN_AGENTS } from "./known-agents.js";

describe("known-agents", () => {
  it("exports a list of known agents", () => {
    expect(KNOWN_AGENTS).toBeInstanceOf(Array);
    expect(KNOWN_AGENTS.length).toBeGreaterThan(0);
  });

  it("includes claude-code agent", () => {
    const claudeCode = KNOWN_AGENTS.find((a) => a.type === "claude-code");
    expect(claudeCode).toBeDefined();
    expect(claudeCode?.displayName).toBe("Claude Code");
  });

  it("claude-code has expected capabilities", () => {
    const claudeCode = KNOWN_AGENTS.find((a) => a.type === "claude-code");
    expect(claudeCode?.capabilities.canResume).toBe(true);
    expect(claudeCode?.capabilities.canInject).toBe(true);
    expect(claudeCode?.capabilities.supportsStreaming).toBe(true);
  });
});
