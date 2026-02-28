import { describe, expect, it } from "vitest";
import type { Finding } from "@/lib/types";
import { buildFindingsFixPrompt } from "./finding-prompt-builder";

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: "f1",
    repo_id: "repo1",
    scan_id: "scan1",
    category: "dependencies",
    severity: "warning",
    title: "Outdated: react",
    details: "Expected ^18.0.0, found ^17.0.0",
    evidence: '"react": "^17.0.0" in package.json',
    suggested_actions: ["Update react to ^18.0.0", "Run: npm install react@18"],
    created_at: "2024-01-01",
    ...overrides,
  };
}

describe("buildFindingsFixPrompt", () => {
  it("includes repo path", () => {
    const prompt = buildFindingsFixPrompt([], "/my/repo");
    expect(prompt).toContain("/my/repo");
  });

  it("includes finding title and details", () => {
    const prompt = buildFindingsFixPrompt([makeFinding()], "/repo");
    expect(prompt).toContain("## Issue 1: Outdated: react");
    expect(prompt).toContain("Details: Expected ^18.0.0, found ^17.0.0");
  });

  it("includes evidence when provided", () => {
    const prompt = buildFindingsFixPrompt([makeFinding()], "/repo");
    expect(prompt).toContain('Evidence: "react": "^17.0.0" in package.json');
  });

  it("includes suggested actions", () => {
    const prompt = buildFindingsFixPrompt([makeFinding()], "/repo");
    expect(prompt).toContain("Suggested actions:");
    expect(prompt).toContain("  - Update react to ^18.0.0");
    expect(prompt).toContain("  - Run: npm install react@18");
  });

  it("omits details when null", () => {
    const prompt = buildFindingsFixPrompt([makeFinding({ details: null })], "/repo");
    expect(prompt).not.toContain("Details:");
  });

  it("omits evidence when null", () => {
    const prompt = buildFindingsFixPrompt([makeFinding({ evidence: null })], "/repo");
    expect(prompt).not.toContain("Evidence:");
  });

  it("omits suggested actions when empty", () => {
    const prompt = buildFindingsFixPrompt([makeFinding({ suggested_actions: [] })], "/repo");
    expect(prompt).not.toContain("Suggested actions:");
  });

  it("numbers multiple findings sequentially", () => {
    const findings = [
      makeFinding({ title: "Issue A" }),
      makeFinding({ title: "Issue B" }),
      makeFinding({ title: "Issue C" }),
    ];
    const prompt = buildFindingsFixPrompt(findings, "/repo");
    expect(prompt).toContain("## Issue 1: Issue A");
    expect(prompt).toContain("## Issue 2: Issue B");
    expect(prompt).toContain("## Issue 3: Issue C");
  });

  it("includes safety instructions at the end", () => {
    const prompt = buildFindingsFixPrompt([makeFinding()], "/repo");
    expect(prompt).toContain("Read existing files before modifying");
    expect(prompt).toContain("Make minimal changes");
    expect(prompt).toContain("Do not reformat or restructure unrelated code");
  });

  it("generates valid prompt for empty findings array", () => {
    const prompt = buildFindingsFixPrompt([], "/repo");
    expect(prompt).toContain("fixing issues");
    expect(prompt).toContain("Important:");
  });
});
