import { describe, expect, it } from "vitest";
import { extractActivitySummary } from "@/components/dashboard/activity-summary";

function makeLog(content: string, stream = "stdout") {
  return { content, stream };
}

describe("extractActivitySummary", () => {
  it("returns null for empty logs", () => {
    expect(extractActivitySummary([])).toBeNull();
  });

  it("detects file modification with 'modifying'", () => {
    const result = extractActivitySummary([makeLog("Modifying `src/index.ts`")]);
    expect(result).toBe("Modifying src/index.ts");
  });

  it("detects file modification with 'editing'", () => {
    const result = extractActivitySummary([makeLog("Editing config.json")]);
    expect(result).toBe("Modifying config.json");
  });

  it("detects creating files with .ts extension", () => {
    const result = extractActivitySummary([makeLog("Creating utils.ts")]);
    expect(result).toBe("Creating utils.ts");
  });

  it("detects creating files with 'file' keyword", () => {
    const result = extractActivitySummary([makeLog("Creating file helper.js")]);
    expect(result).toBe("Creating file");
  });

  it("detects creating files with .tsx extension", () => {
    const result = extractActivitySummary([makeLog("Creating component.tsx")]);
    expect(result).toBe("Creating component.tsx");
  });

  it("detects running tests with 'running tests'", () => {
    const result = extractActivitySummary([makeLog("Running tests now")]);
    expect(result).toBe("Running tests");
  });

  it("detects running tests with 'npm test'", () => {
    const result = extractActivitySummary([makeLog("npm test completed")]);
    expect(result).toBe("Running tests");
  });

  it("detects running tests with 'pnpm test'", () => {
    const result = extractActivitySummary([makeLog("pnpm test --coverage")]);
    expect(result).toBe("Running tests");
  });

  it("detects installing dependencies with 'npm install'", () => {
    const result = extractActivitySummary([makeLog("npm install finished")]);
    expect(result).toBe("Installing dependencies");
  });

  it("detects installing dependencies with 'pnpm install'", () => {
    const result = extractActivitySummary([makeLog("pnpm install running")]);
    expect(result).toBe("Installing dependencies");
  });

  it("detects installing with 'installing'", () => {
    const result = extractActivitySummary([makeLog("Installing packages")]);
    expect(result).toBe("Installing dependencies");
  });

  it("detects analyzing code with 'analyzing'", () => {
    const result = extractActivitySummary([makeLog("Analyzing the codebase")]);
    expect(result).toBe("Analyzing code");
  });

  it("detects analyzing code with 'reading code'", () => {
    const result = extractActivitySummary([makeLog("Reading code for review")]);
    expect(result).toBe("Analyzing code");
  });

  it("detects building with 'building'", () => {
    const result = extractActivitySummary([makeLog("Building the project")]);
    expect(result).toBe("Building project");
  });

  it("detects building with 'npm run build'", () => {
    const result = extractActivitySummary([makeLog("npm run build completed")]);
    expect(result).toBe("Building project");
  });

  it("detects building with 'pnpm build'", () => {
    const result = extractActivitySummary([makeLog("pnpm build started")]);
    expect(result).toBe("Building project");
  });

  it("detects git commit", () => {
    const result = extractActivitySummary([makeLog("git commit -m 'fix: bug'")]);
    expect(result).toBe("Committing changes");
  });

  it("detects committing with 'committing'", () => {
    const result = extractActivitySummary([makeLog("Committing staged changes")]);
    expect(result).toBe("Committing changes");
  });

  it("detects git push", () => {
    const result = extractActivitySummary([makeLog("git push origin main")]);
    expect(result).toBe("Pushing to remote");
  });

  it("detects pushing with 'pushing'", () => {
    const result = extractActivitySummary([makeLog("Pushing to remote branch")]);
    expect(result).toBe("Pushing to remote");
  });

  it("detects linting with 'linting'", () => {
    const result = extractActivitySummary([makeLog("Linting all files")]);
    expect(result).toBe("Running linter");
  });

  it("detects linting with 'eslint'", () => {
    const result = extractActivitySummary([makeLog("eslint check passed")]);
    expect(result).toBe("Running linter");
  });

  it("detects linting with 'biome'", () => {
    const result = extractActivitySummary([makeLog("biome check --fix")]);
    expect(result).toBe("Running linter");
  });

  it("uses last system message as fallback when short enough", () => {
    const logs = [makeLog("random output", "stdout"), makeLog("Agent started", "system")];
    const result = extractActivitySummary(logs);
    expect(result).toBe("Agent started");
  });

  it("falls back to 'Agent is working...' when system message is too long", () => {
    const longMessage = "A".repeat(70);
    const logs = [makeLog(longMessage, "system")];
    const result = extractActivitySummary(logs);
    expect(result).toBe("Agent is working...");
  });

  it("returns most recent matching pattern (reverse order)", () => {
    const logs = [makeLog("Analyzing the codebase"), makeLog("Linting all files")];
    const result = extractActivitySummary(logs);
    expect(result).toBe("Running linter");
  });

  it("only analyzes last 20 logs", () => {
    const filler = Array.from({ length: 25 }, (_, i) => makeLog(`Filler log ${i}`));
    const logs = [makeLog("Running tests should be ignored"), ...filler];
    const result = extractActivitySummary(logs);
    // The "Running tests" is beyond the 20-log window so won't be found
    expect(result).toBe("Agent is working...");
  });
});
